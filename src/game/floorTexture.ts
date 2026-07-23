import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { GOAL_HALF, HALF_W } from './const'

/**
 * Procedurally paints the Bitmap-Brothers metal-blue floor: a riveted steel
 * plate, a big lavender 5-point star, a green center line with rivet dots, and
 * a center face-off circle + square. Drawn at low res with hard pixels so it
 * reads as authentic 16-bit once the whole scene is pixelated.
 *
 * The canvas maps directly onto the table plane: canvas +x → table +x, canvas
 * +y (down) → table +z (near/our end at the bottom).
 */
export function makeFloorTexture(): CanvasTexture {
  const S = 3 // supersample: draw the 256×410 layout onto a 3× backing store
  const W = 256
  const H = 410 // ≈ W * (HALF_L/HALF_W) so texels stay square on the table
  const c = document.createElement('canvas')
  c.width = W * S
  c.height = H * S
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  g.scale(S, S) // all drawing below stays in 256×410 coordinates, at 3× res

  // --- steel base with a faint vertical panel gradient ---
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, '#556982')
  grad.addColorStop(0.5, '#5f7490')
  grad.addColorStop(1, '#556982')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  // --- lavender star (points toward the four corners + top) ---
  drawStar(g, W / 2, H / 2, W * 0.46, W * 0.19, 5, '#6e6b92', 0.6)

  // --- embossed center line + face-off circle (engraved, like the rivets) ---
  const cx = W / 2
  const cy = H / 2
  // Center line: a light highlight above a dark groove.
  g.fillStyle = '#9fb4cc'
  g.fillRect(0, cy - 1, W, 1)
  g.fillStyle = '#3a4658'
  g.fillRect(0, cy, W, 1)
  // Circle: same top-left highlight / bottom-right shadow bevel as a rivet.
  embossCircle(g, cx, cy, 34)

  // --- rivet dot grid over the whole plate, denser on the center line ---
  const step = 22
  for (let y = step; y < H; y += step) {
    for (let x = step; x < W; x += step) {
      rivet(g, x, y)
    }
  }
  for (let x = step / 2; x < W; x += step / 2) rivet(g, x, cy) // center line rivets

  // --- goal mouths top and bottom (amber posts framing the opening) ---
  const goalPx = (GOAL_HALF / HALF_W) * (W / 2)
  drawGoal(g, cx, 3, goalPx)
  drawGoal(g, cx, H - 3, goalPx)

  const tex = new CanvasTexture(c)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 1
  return tex
}

function embossCircle(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.lineWidth = 1
  g.strokeStyle = '#9fb4cc' // highlight, offset up-left
  g.beginPath()
  g.arc(cx - 0.6, cy - 0.6, r, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = '#3a4658' // shadow, offset down-right
  g.beginPath()
  g.arc(cx + 0.6, cy + 0.6, r, 0, Math.PI * 2)
  g.stroke()
}

function rivet(g: CanvasRenderingContext2D, x: number, y: number) {
  // A 2×2 bevel: light top-left, dark bottom-right.
  g.fillStyle = '#9fb4cc'
  g.fillRect(x - 1, y - 1, 1, 1)
  g.fillStyle = '#3a4658'
  g.fillRect(x, y, 1, 1)
}

function drawGoal(g: CanvasRenderingContext2D, cx: number, y: number, halfPx: number) {
  g.strokeStyle = '#e0a52e'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(cx - halfPx, y)
  g.lineTo(cx + halfPx, y)
  g.stroke()
}

function drawStar(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  color: string,
  alpha: number,
) {
  g.save()
  g.globalAlpha = alpha
  g.fillStyle = color
  g.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2 // first point up
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
  g.fill()
  g.restore()
}
