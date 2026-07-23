import { CanvasTexture, LinearFilter, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three'

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

/** Riveted brushed-steel panel for the walls; tiles along the wall length. */
export function makeSteelTexture(repeatY = 8): CanvasTexture {
  const S = 64
  const c = canvas(S, S)
  const g = c.getContext('2d')!
  g.fillStyle = '#46566b'
  g.fillRect(0, 0, S, S)
  // Brushed vertical streaks.
  for (let x = 0; x < S; x += 3) {
    g.fillStyle = x % 6 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'
    g.fillRect(x, 0, 1, S)
  }
  // Rivets top and bottom.
  for (const y of [8, S - 8]) {
    for (let x = 8; x < S; x += 16) {
      g.fillStyle = '#8ea4bd'
      g.fillRect(x - 1, y - 1, 2, 2)
      g.fillStyle = '#2a3340'
      g.fillRect(x + 1, y + 1, 1, 1)
    }
  }
  const tex = new CanvasTexture(c)
  tex.wrapT = RepeatWrapping
  tex.wrapS = RepeatWrapping
  tex.repeat.set(1, repeatY)
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
