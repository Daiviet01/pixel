import firebase from 'firebase/app'
import {} from 'firebase/database'
import config from '../config'
import m from 'mithril'

const app = firebase.initializeApp(config)

function parsePixel(s) {
  let nums = s.match(/(\d+)\,(\d+)/)
  return {
    x: s[1],
    y: s[2]
  }
}

function parseMultiplePixels(s) {
  return s.split("|").map(parsePixel)
}

function serializeMultiplePixels(pixels) {
  let parts = []
  pixels.forEach(({x, y}) => {
    parts.push([x,y].join(","))
  })
  return parts.join("|")
}

function nextIndex (obj) {
  let i = 0
  while (obj[i] !== undefined) {
    i += 1
  }
  return i
}

// returns promise that resolves to true or false
export function gameExists (checkId) {
  let gameState = firebase.database().ref(`games/${checkId}`)
  return gameState
    .once('value')
    .then(snap => !!(snap.val()))
}

// generates new game code and creates new game for it, and returns a promise containing the new game object
export function freshNewGame () {
  function genId (resolve) {
    var newId = "";
    var chars = "abcdefghijkmnpqrstuvwxyz23456789";

    for (let i=0; i < 7; i++) {
      newId += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // not sure how to avoid the race condition here with firebase
    // but collisions are remarkably unlikely so I think it's ok
    let gameState = firebase.database().ref(`games/${newId}`)
    gameState
      .once('value')
      .then(snap => {
        if (snap.val() === null) {
          gameState.set({
            sketches: {red: {}, blue: {}},
            rectangles: {red: {}, blue: {}},
            image: "",
            pixels: {red: {}, blue: {}},
            players: {blue: 0, judge: 0, red: 0}
          })
          resolve(newId)
        } else {
          console.warn("GAME ALREADY EXISTS:", snap.val())
          genId(resolve)
        }
      })
  }

  return new Promise(function(resolve, reject) {
    genId(resolve)
  }).then((newId) => {
    return new Game(newId)
  })
}

export class Game {
  constructor (gameId) {
    this.onUpdates = []
    this.state = null
    this.code = gameId
    this.currentPlayer = null // role of this player, either 'red' 'blue' 'judge' or null
    this.dbref = firebase.database().ref(`games/${gameId}`)
    this.dbref.on('value', snap => {
      this.state = snap.val()
      this.onUpdates.forEach(f => { f() })
    })
  }

  onUpdate (f) {
    this.onUpdates.push(f)
    f()
  }

  _checkCanDraw () {
    if (!this.state || !this.state.players || ["red", "blue"].indexOf(this.currentPlayer) === -1) {
      throw "Can only draw if current player is red or blue"
    }
  }

  _addDrawing (drawingType, data) {
    this._checkCanDraw()

    // normally you'd want to use firebase's .push() here, but since only one unique writer for each object,
    // we can keep track of it locally
    let i = 0
    if (this.state[drawingType] !== undefined && this.state[drawingType][this.currentPlayer] !== undefined) {
      i = nextIndex(this.state[drawingType][this.currentPlayer])
    }
    this.dbref.child(drawingType).child(this.currentPlayer).child(i).set(data)
    return i
  }

  _removeDrawing (drawingType, index) {
    this._checkCanDraw()
    this.dbref.child(drawingType).child(this.currentPlayer).child(index).set(null)
    return index
  }

  gamePlaying () {
    return (this.gameFull() && this.currentPlayer !== null)
  }

  gameFull () {
    return (this.state
      && this.state.players.red === 1
      && this.state.players.blue === 1
      && this.state.players.judge === 1)
  }

  pixels (player) {
    if (this.state && this.state.pixels && this.state.pixels[player]) {
      return Object.values(this.state.pixels[player]).map(parsePixel)
    }
    return []
  }

  addPixel(x, y) {
    let str = serializeMultiplePixels([{x, y}])
    return this._addDrawing('pixels', str)
  }

  sketches () {
    if (this.state && this.state.sketches && this.state.sketches[player]) {
      return Object.values(this.state.pixels[player]).map(parseMultiplePixels)
    }
    return []
  }

  // points is array of {x: int, y: int} objects
  addSketch (points) {
    let str = serializeMultiplePixels(points)
    return this._addDrawing('sketches', str)
  }

  removeSketch (sketchId) {
    return this._removeDrawing('sketches', sketchId)
  }

  rectangles () {
    if (this.state && this.state.sketches && this.state.sketches[player]) {
      return Object.values(this.state.pixels[player]).map(str => {
        let res = parseMultiplePixels(str)
        return {x: res[0].x, y: res[0].y, w: res[1].x, h: res[1].y}
      })
    }
    return []
  }

  addRectangle (x, y, w, h) {
    let str = serializeMultiplePixels([{x: x, y: y}, {x: w, y: h}])
    return this._addDrawing('rectangles', str)
  }

  removeRectangle (rectId) {
    return this._removeDrawing('rectangles', rectId)
  }

  players () {
    return this.state.players
  }

  isLoading () {
    return this.state === null
  }

  setCurrentPlayer (player) {
    if (["red", "blue", "judge"].indexOf(player) === -1) {
      throw "Invalid player type"
    }
    // TODO update database to reject new edits of player
    return this.dbref
      .child('players').child(player)
      .set(1)
      .then(() => {
        // successfully set player
        this.currentPlayer = player
      })
  }
}