import m from 'mithril'
import ImageSelector from '../components/image_selector'
import {description} from '../components/description'

const COLORS = {
  RED: 'rgba(239, 65, 70, 0.5)',
  BLUE: 'rgba(84, 54, 218, 0.5)',
  RED_FULL: 'rgba(239, 65, 70, 1)',
  BLUE_FULL: 'rgba(84, 54, 218, 1)',
  RED_FADED: 'rgba(239, 65, 70, 0.1)',
  BLUE_FADED: 'rgba(84, 54, 218, 0.1)',
  SELECTION: 'rgba(157, 35, 220, 0.9)'
}

const PIXEL_WIDTH = 9
const LOUPE_VIEW_PAD = 14
const PIXEL_DENSITY = 2
const ERASER_SIZE = 10

function capitalize (str) {
  return str[0].toUpperCase() + str.slice(1)
}

// returns clicked rect at x, y
// return null if no rect within +- 10 pixels of clicked point
// also always counts rects no matter how far border is if cursor is inside bounds
function closestRect (rectangles, x, y) {
  let best = null
  let bestDist = null
  Object.keys(rectangles).forEach(rectId => {
    let rect = rectangles[rectId]
    let overallDist = Math.min(
      manhattanDistToFilledRect(x, y, rect.x, rect.y, 1, rect.h),
      manhattanDistToFilledRect(x, y, rect.x, rect.y, rect.w, 1),
      manhattanDistToFilledRect(x, y, rect.x+rect.w, rect.y, 1, rect.h),
      manhattanDistToFilledRect(x, y, rect.x, rect.y+rect.h, rect.w, 1)
    )
    let validRect = overallDist < ERASER_SIZE || (x>=rect.x && y>=rect.y && x<rect.x+rect.w && y<rect.y+rect.h)
    if ((bestDist===null || overallDist < bestDist) && validRect) {
      bestDist = overallDist
      best = rectId
    }
  })
  return best
}

function shouldDisplayImage (vnode) {
  return vnode.state.imgCanvas && vnode.state.revealImage
}

function manhattanDistToFilledRect (pointX, pointY, x, y, w, h) {
  let totalDist = 0
  if (pointX < x) {
    totalDist += x-pointX
  } else if (pointX > x+w) {
    totalDist += pointX-(x+w)
  }
  if (pointY < y) {
    totalDist += y-pointY
  } else if (pointY > y+h) {
    totalDist += pointY-(y+h)
  }
  return totalDist
}

function setCanvasSize (canvas, width, height) {
  canvas.width = width*PIXEL_DENSITY
  canvas.height = height*PIXEL_DENSITY
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

function normalizeRect(currentRect) {
  let {x1,x2,y1,y2} = currentRect
  return {
    x: Math.round(Math.min(x1, x2)),
    y: Math.round(Math.min(y1, y2)),
    w: Math.round(Math.abs(x1-x2)),
    h: Math.round(Math.abs(y1-y2))
  }
}

function drawGame (vnode, canvas, isLoupe, dx=0, dy=0) {
  let game = vnode.attrs.game
  let ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 500*PIXEL_DENSITY, 500*PIXEL_DENSITY)
  ctx.fillStyle = "#fff"
  ctx.fillRect(0,0,500*PIXEL_DENSITY, 500*PIXEL_DENSITY)
  if (isLoupe && !vnode.state.mouseIsOver) {
    return
  }
  let canEdit = vnode.attrs.role === vnode.state.viewingPlayer
  let pixelMult = isLoupe ? 600/(LOUPE_VIEW_PAD*2+1) : PIXEL_DENSITY
  dx *= pixelMult
  dy *= pixelMult
  if (isLoupe) {
    dx -= LOUPE_VIEW_PAD*pixelMult
    dy -= LOUPE_VIEW_PAD*pixelMult
  }
  if (shouldDisplayImage(vnode)) {
    ctx.drawImage(
      vnode.state.imgCanvas,
      0-dx, 0-dy, pixelMult*vnode.state.imgCanvas.width, pixelMult*vnode.state.imgCanvas.height)
    if (!isLoupe) {
      if (!isLoupe && vnode.state.mouseIsOver) {
        // fade background image if mouse is over image
        ctx.lineWidth = 0
        ctx.fillStyle = 'rgba(255,255,255,0.4)'
        ctx.fillRect(0,0,vnode.state.canvas.width, vnode.state.canvas.height)
      }
    }
  }
  function drawRects (player, color) {
    function drawRect (x, y, w, h, id) {
      ctx.lineWidth = 0
      if (!isLoupe && id === vnode.state.closestRect && vnode.state.tool === 'erase' && player === vnode.attrs.game.role) {
        ctx.fillStyle = COLORS.SELECTION
      } else {
        ctx.fillStyle = color
      }
      ctx.fillRect((x+.5)*pixelMult-dx, (y+.5)*pixelMult-dy, w*pixelMult, h*pixelMult)
    }
    let rectangles = game.rectangles(player)
    Object.keys(rectangles).forEach(rectId => {
      let {x,y,w,h} = rectangles[rectId]
      drawRect(x,y,w,h,rectId)
    })
    if (vnode.state.currentRect) {
      let {x,y,w,h} = normalizeRect(vnode.state.currentRect)
      drawRect(x,y,w,h,-1)
    }
  }
  if (vnode.state.viewingPlayer === 'red') {
    drawRects('blue', COLORS.BLUE_FADED)
    drawRects('red', COLORS.RED)
  } else {
    drawRects('red', COLORS.RED_FADED)
    drawRects('blue', COLORS.BLUE)
  }
  function pixelHandler (color) {
    let drawnPixelWidth = isLoupe ? 1 : PIXEL_WIDTH
    ctx.lineWidth = isLoupe ? 5 : 3
    ctx.strokeStyle = color
    return ({x,y}) => {
      if (vnode.state.imgCanvas) {
        ctx.fillStyle = pixelColor(vnode, {x,y})
        ctx.beginPath()
        ctx.rect((x - drawnPixelWidth/2 + 0.5)*pixelMult-dx,
          (y - drawnPixelWidth/2 + 0.5)*pixelMult-dy,
          drawnPixelWidth*pixelMult,
          drawnPixelWidth*pixelMult)
        ctx.fill()
        ctx.stroke()
      }
    }
  }
  game.pixels('red').forEach(pixelHandler(COLORS.RED_FULL))
  game.pixels('blue').forEach(pixelHandler(COLORS.BLUE_FULL))
}

function updateLoupe (vnode, pos) {
  let loupeCanvas = document.getElementById('loupe')
  let loupeCtx = loupeCanvas.getContext('2d')
  loupeCtx.imageSmoothingEnabled = false;
  loupeCtx.clearRect(0, 0, 600, 600);
  if (pos === undefined) {
    pos = vnode.state.mousePos
  }
  vnode.state.mousePos = pos
  if (pos !== null && vnode.state.mouseIsOver) {
    let x = Math.round(pos.x)
    let y = Math.round(pos.y)
    drawGame(vnode, loupeCanvas, true, x, y)
  } else {
    loupeCtx.fillStyle = "#fff"
    loupeCtx.fillRect(0,0,600,600)
  }
  loupeCtx.setLineDash([12,12.5])
  loupeCtx.lineWidth = 2
  loupeCtx.strokeStyle = 'rgba(0,0,0,0.3)'
  loupeCtx.beginPath()
  loupeCtx.moveTo(0, 301)
  loupeCtx.lineTo(600, 301)
  loupeCtx.moveTo(301, 0)
  loupeCtx.lineTo(301, 600)
  loupeCtx.stroke()
  loupeCtx.beginPath()
  loupeCtx.moveTo(0, 299)
  loupeCtx.lineTo(600, 299)
  loupeCtx.moveTo(299, 0)
  loupeCtx.lineTo(299, 600)
  loupeCtx.stroke()
  loupeCtx.strokeStyle = '#C5C5D2'
  loupeCtx.beginPath()
  loupeCtx.moveTo(0, 300)
  loupeCtx.lineTo(600, 300)
  loupeCtx.moveTo(300, 0)
  loupeCtx.lineTo(300, 600)
  loupeCtx.stroke()
  loupeCtx.setLineDash([])
}

function updateImage (vnode) {
  if (vnode.attrs.game.imageUrl() !== vnode.state.lastImageUrl) {
    vnode.state.lastImageUrl = vnode.attrs.game.imageUrl()
    if (vnode.attrs.game.hasImage()) {
      let thisImageUrl = vnode.attrs.game.imageUrl()
      vnode.attrs.game.image().then(imgCanvas => {
        if (vnode.state.lastImageUrl === thisImageUrl) { // ensure it hasn't been changed again in the meantime
          vnode.state.imgCanvas = imgCanvas
          setCanvasSize(vnode.state.canvas, imgCanvas.width, imgCanvas.height)
          m.redraw()
        }
      })
    } else {
      vnode.state.imgCanvas = null
      setCanvasSize(vnode.state.canvas, 500, 500)
    }
  }
}

function pixelColor (vnode, pos) {
  let pixelData = vnode.state.imgCanvas.getContext('2d').getImageData(pos.x, pos.y, 1, 1).data
  return `rgba(${pixelData.join(',')})`
}

function getMouseCoords(vnode, event) {
  let bounds = vnode.state.canvas.getBoundingClientRect()
  return {x: (event.clientX - bounds.left), y: (event.clientY - bounds.top)}
}

function updateCanvas (vnode) {
  drawGame(vnode, vnode.state.canvas, false)
  updateLoupe(vnode)
}

export default {
  oninit: (vnode) => {
    let reset = () => {
      vnode.state.tool = 'rect' // either 'rect', 'pixel', 'erase'
      vnode.state.viewingPlayer = vnode.attrs.game.role === 'blue' ? 'blue' : 'red'
      vnode.state.revealImage = vnode.attrs.game.role !== 'judge'
      vnode.state.mousePos = null
      vnode.state.lastImageUrl = ""
      vnode.state.imgCanvas = null
      vnode.state.currentRect = null
      vnode.state.rectEnd = null
      vnode.state.closestRect = null
      vnode.state.mouseIsOver = false
    }
    reset()
    vnode.attrs.game.onReset(reset)
  },
  oncreate: (vnode) => {
    vnode.state.canvas = document.getElementById('play')
    setCanvasSize(vnode.state.canvas, 500, 500)
    vnode.state.canvas.onmousedown = event => {
      if (vnode.attrs.game.role === 'judge') {
        return
      }
      let {x,y} = getMouseCoords(vnode, event)
      if (vnode.state.tool === 'erase' && vnode.state.closestRect) {
        vnode.attrs.game.removeRectangle(vnode.state.closestRect)
      } else if (vnode.state.tool === 'pixel') {
        vnode.attrs.game.addPixel(Math.round(x), Math.round(y))
      } else if (vnode.state.tool === 'rect') {
        vnode.state.currentRect = {x1: x, y1: y, x2: x, y2: y}
      }
      m.redraw()
    }
    vnode.state.canvas.onmouseup = event => {
      let {x,y} = getMouseCoords(vnode, event)
      if (vnode.state.tool === 'rect' && vnode.state.currentRect !== null) {
        let {x,y,w,h} = normalizeRect(vnode.state.currentRect)
        vnode.attrs.game.addRectangle(x,y,w,h)
        vnode.state.currentRect = null
        m.redraw()
      }
    }
    vnode.state.canvas.onmousemove = event => {
      vnode.state.mouseIsOver = true
      let {x,y} = getMouseCoords(vnode, event)
      if (vnode.attrs.game.role !== 'judge') {
        vnode.state.closestRect = closestRect(vnode.attrs.game.rectangles(vnode.attrs.game.role), x, y)
      } else {
        vnode.state.closestRect = null
      }
      updateCanvas(vnode)
      updateLoupe(vnode, {x, y})
      if (vnode.state.currentRect) {
        vnode.state.currentRect.x2 = x
        vnode.state.currentRect.y2 = y
      }
      m.redraw()
    }
    vnode.state.canvas.onmouseover = () => {
      vnode.state.mouseIsOver = true
      m.redraw()
    }
    vnode.state.canvas.onmouseout = () => {
      vnode.state.mouseIsOver = false
      vnode.state.closestRect = null
      m.redraw()
    }
    updateImage(vnode)
    updateCanvas(vnode)
    updateLoupe(vnode, null)
  },
  onupdate: (vnode) => {
    updateImage(vnode)
    updateCanvas(vnode)
  },
  view: (vnode) => {
    const stateButton = (type, name, label, disable=false) => {
      return m('button', {
        class: vnode.state[type] === name ? "selected" : "",
        disabled: disable,
        onclick: () => {vnode.state[type] = name}
      }, label)
    }

    let playerbar = m('div', [
      stateButton('viewingPlayer', 'red', vnode.attrs.role === 'red' ? 'Your Drawing' : "Red's Drawing"),
      stateButton('viewingPlayer', 'blue', vnode.attrs.role === 'blue' ? 'Your Drawing' : "Blue's Drawing"),
    ])

    let toolbar = []
    if (vnode.state.revealImage) {
      toolbar.push(stateButton('revealImage', false, 'Hide Image', !vnode.attrs.game.hasImage()))
      if (vnode.attrs.game.attribution()) {
        toolbar.push(m('a', {href: vnode.attrs.game.attribution().url}, vnode.attrs.game.attribution().text))
      }
    } else {
      toolbar.push(stateButton('revealImage', true, 'Reveal Image', !vnode.attrs.game.hasImage()))
    }
    let rectCoordsView = null
    if (vnode.state.mouseIsOver && vnode.state.mousePos) {
      if (vnode.state.currentRect) {
        let {x1,y1,x2,y2} = vnode.state.currentRect
        rectCoordsView = m('.hint.row', [
          m('.coord', {style: 'width:50px;'}, `x1: ${Math.round(x1)}`),
          m('.coord', {style: 'width:50px;'}, `y1: ${Math.round(y1)}`),
          m('.coord', {style: 'width:50px;'}, `x2: ${Math.round(x2)}`),
          m('.coord', {style: 'width:50px;'}, `y2: ${Math.round(y2)}`),
        ])
      } else {
        let {x,y} = vnode.state.mousePos
        rectCoordsView = m('.hint.row', [
          m('.coord', {style: 'width:50px;'}, `x: ${Math.round(x)}`),
          m('.coord', {style: 'width:50px;'}, `y: ${Math.round(y)}`),
        ])
      }
    }

    let [coinResult, coinHash] = vnode.attrs.game.coinflipResult()

    let roleSection = []
    let coinSection = null
    if (vnode.attrs.game.role === 'judge') {
      roleSection.push(m('.role-judge', 'Judge'))
      if (vnode.attrs.game.isFull()) {
        roleSection.push(m('.hint', {disabled: true}, 'Looks like this game already has two debaters.'))
      } else {
        roleSection.push(m('button', {onclick: () => {
          vnode.attrs.game.becomeDebater().then(color => {
            if (color) {
              vnode.state.viewingPlayer = color
              vnode.state.revealImage = true
            }
          })
        }}, 'Become a Debater'))
      }
    } else {
      let roleName = capitalize(vnode.attrs.game.role)
      roleSection.push(m(`.role-${vnode.attrs.game.role}`, `${roleName} Player`))
      if (vnode.attrs.role === vnode.state.viewingPlayer) {
        roleSection = roleSection.concat([
          stateButton('tool', 'rect', 'Rectangle Tool'),
          stateButton('tool', 'pixel', 'Pixel Reveal Tool'),
          stateButton('tool', 'erase', 'Eraser'),
        ])
      }
    }
    return m('.col.gap-4.justify', [
      description(),
      m('hr'),
      m('.row.gap-4', [
        m('.tools.col.gap-3', [
          m('.col.gap-1.justify', [
            m('h2', 'Game Link'),
            m('a', {href: `/game/${vnode.attrs.game.code}`}, `/game/${vnode.attrs.game.code}`),
            m('p.hint', 'Copy, paste, and send link to invite others to join this game.')
          ]),
          m('hr'),
          m('.col.gap-1.justify', [
            m('h2', 'Current Role'),
            roleSection,
          ]),
          vnode.attrs.game.role === 'judge' ? null : [
            m('hr'),
            m('.col.gap-1.justify', [
              m('h2', 'Coin Flip'),
              m('span.coinResults', {
                oncreate: (vnode) => vnode.state.coinHash = coinHash,
                onupdate: (vnode) => {
                  if (vnode.state.coinHash !== coinHash) {
                    vnode.state.coinHash = coinHash
                    vnode.dom.style.animation = 'none'
                    vnode.dom.offsetWidth // reflow
                    vnode.dom.style.animation = null
                  }
                }
              }, coinResult ? 'Heads' : 'Tails'),
              m('button', {onclick: () => {
                vnode.attrs.game.coinflip()
              }}, 'Flip Coin'),
              m('p.hint', 'Only debaters can see the result of coin flips.')
            ])
          ],
          m('hr'),
          m('button', {onclick: () => {
            vnode.attrs.game.reset()
          }}, 'Reset Board & Roles')
        ]),
        m('div', [
          vnode.attrs.role === 'judge' ? null : m('div', [
            m(ImageSelector, {game: vnode.attrs.game}),
          ]),
          playerbar,
          m('canvas#play', {style: 'box-shadow: 0px 0px 0px 1px #ccc; cursor: crosshair;'}),
          m('.row.gap-2.middle', toolbar),
        ]),
        m('.col.gap-3', [
          m('h2', 'Zoom'),
          m('canvas#loupe', {width: 600, height:600, style: 'width: 250px; height: 250px;'}),
          rectCoordsView
        ])
      ]),
      vnode.attrs.game.connected ? null : m('div', 'Disconnected! Trying to reconnect...')
    ])
  }
}
