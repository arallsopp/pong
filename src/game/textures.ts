import { CanvasTexture, LinearFilter, NearestFilter, SRGBColorSpace } from 'three'
import { WALL_H } from './const'
import { PLATE_EDGE, PLATE_MID, PLATE_PX, RIVET_PX, rivet } from './floorTexture'

export interface TeamPalette {
  light: string
  base: string
  dark: string
}

export const PLAYER_PAL: TeamPalette = { light: '#bfe0ff', base: '#3f8fe0', dark: '#1a4f8a' }
export const AI_PAL: TeamPalette = { light: '#ffd0b0', base: '#e86a2f', dark: '#8a3410' }

/**
 * A view-space steel "matcap" — shading baked into a texture so an unlit sphere
 * reads as a round chrome ball from any angle, no lights or env map needed.
 * Kept linear-filtered so the ball stays smooth and round (its metal look is the
 * point; the pixel identity lives in the flat surfaces).
 */
export function makeMetalMatcap(): CanvasTexture {
  const S = 256
  const c = canvas(S, S)
  const g = c.getContext('2d')!
  g.fillStyle = '#12161d'
  g.fillRect(0, 0, S, S)

  // Main body: highlight up-left, falling to a dark rim.
  const grad = g.createRadialGradient(S * 0.36, S * 0.32, S * 0.02, S * 0.5, S * 0.5, S * 0.5)
  grad.addColorStop(0, '#f4f8ff')
  grad.addColorStop(0.16, '#cbd6e4')
  grad.addColorStop(0.42, '#8492a6')
  grad.addColorStop(0.72, '#4c5768')
  grad.addColorStop(1, '#1c222b')
  g.fillStyle = grad
  disc(g, S / 2, S / 2, S / 2)

  // Cool rim bounce, lower-right.
  const rim = g.createRadialGradient(S * 0.74, S * 0.8, 0, S * 0.74, S * 0.8, S * 0.5)
  rim.addColorStop(0, 'rgba(150,180,220,0.5)')
  rim.addColorStop(0.5, 'rgba(120,150,190,0.12)')
  rim.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = rim
  disc(g, S / 2, S / 2, S / 2)

  const tex = new CanvasTexture(c)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** Team-tinted brushed-metal paddle cap with a hub and rim rivets. */
export function makePaddleTexture(pal: TeamPalette): CanvasTexture {
  const S = 256
  const c = canvas(S, S)
  const g = c.getContext('2d')!
  const cx = S / 2
  const cy = S / 2

  g.fillStyle = '#2a3340'
  g.fillRect(0, 0, S, S)

  // Metal disc with a team tint.
  const grad = g.createRadialGradient(cx, cy * 0.8, 6, cx, cy, S * 0.5)
  grad.addColorStop(0, pal.light)
  grad.addColorStop(0.5, pal.base)
  grad.addColorStop(1, pal.dark)
  g.fillStyle = grad
  disc(g, cx, cy, S * 0.5)

  // Concentric machined rings.
  g.strokeStyle = 'rgba(255,255,255,0.18)'
  g.lineWidth = 2
  for (let r = S * 0.16; r < S * 0.5; r += 14) {
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.stroke()
  }

  // Rim rivets.
  const rr = S * 0.44
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    const x = cx + Math.cos(a) * rr
    const y = cy + Math.sin(a) * rr
    g.fillStyle = '#e9f1fb'
    g.fillRect(x - 2, y - 2, 2, 2)
    g.fillStyle = '#20262f'
    g.fillRect(x, y, 2, 2)
  }

  // Center hub.
  g.fillStyle = pal.dark
  disc(g, cx, cy, S * 0.12)
  g.fillStyle = pal.light
  disc(g, cx - 2, cy - 3, S * 0.05)

  const tex = new CanvasTexture(c)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  return tex
}

/**
 * Riveted steel panel for the walls — the same plate as the floor, so the court
 * reads as one pressed-metal box. Painted at the floor's texel density and
 * covering the run exactly (no tiling), with the rivet grid phase-locked to the
 * run's world position so rivets line up along a wall and with the floor.
 *
 * `lenUnits` is the run's length and `offsetUnits` where it starts along that
 * axis in world space.
 */
export function makeSteelTexture(lenUnits: number, offsetUnits = 0, heightUnits = WALL_H): CanvasTexture {
  const S = 3 // supersample, matching the floor plate
  const W = Math.max(4, Math.round(lenUnits * PLATE_PX))
  const H = Math.max(4, Math.round(heightUnits * PLATE_PX))
  const c = canvas(W * S, H * S)
  const g = c.getContext('2d')!
  g.scale(S, S)

  // Panel gradient, darkest where the wall meets the floor and the cap.
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, PLATE_EDGE)
  grad.addColorStop(0.5, PLATE_MID)
  grad.addColorStop(1, PLATE_EDGE)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  // Two rivet rows straddling the mid-height, on the floor's spacing.
  const step = RIVET_PX
  const first = (step - (((offsetUnits * PLATE_PX) % step) + step) % step) % step
  for (const y of [H / 2 - step / 2, H / 2 + step / 2]) {
    for (let x = first; x < W; x += step) rivet(g, x, y)
  }

  const tex = new CanvasTexture(c)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** Soft round blob shadow for the ball (dark center fading to transparent). */
export function makeShadowTexture(): CanvasTexture {
  const S = 64
  const c = canvas(S, S)
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(0,0,0,0.55)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const tex = new CanvasTexture(c)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  return tex
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  return c
}

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}
