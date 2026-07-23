import {
  BoxGeometry,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three'

export const GUN_R = 1.1 // pickup radius
export const SHOT_SPEED = 46
export const POWER_SECONDS = 6 // how long every effect lasts

/**
 * What a token does when you grab it. The first three are fired at the opponent
 * as a homing bolt and only land if it connects; `shield` applies to your own
 * goal the instant you pick it up.
 */
export type Power = 'freeze' | 'shrink' | 'slow' | 'shield'

export const POWERS: Power[] = ['freeze', 'shrink', 'slow', 'shield']

export const POWER_COLOR: Record<Power, number> = {
  freeze: 0x8ad4ff, // ice blue
  shrink: 0xffe066, // amber
  slow: 0xc79bff, // violet
  shield: 0x8affc0, // green
}

export const POWER_LABEL: Record<Power, string> = {
  freeze: 'FREEZE',
  shrink: 'SHRINK',
  slow: 'SLOW',
  shield: 'SHIELD',
}

const texCache = new Map<Power, CanvasTexture>()

/** A flat pixel-art pickup token, laid on the table, badged with its effect. */
export function makeTokenMesh(power: Power): Mesh {
  let tex = texCache.get(power)
  if (!tex) {
    tex = makeTokenTexture(power)
    texCache.set(power, tex)
  }
  const m = new Mesh(
    new PlaneGeometry(2.2, 2.2),
    new MeshBasicMaterial({ map: tex, transparent: true }),
  )
  m.rotation.x = -Math.PI / 2
  return m
}

/** A short glowing bolt in the effect's colour, travelling up-court. */
export function makeShotMesh(power: Power): Mesh {
  return new Mesh(
    new BoxGeometry(0.35, 0.35, 1.6),
    new MeshBasicMaterial({ color: POWER_COLOR[power] }),
  )
}

function makeTokenTexture(power: Power): CanvasTexture {
  const S = 32
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false
  const accent = `#${POWER_COLOR[power].toString(16).padStart(6, '0')}`

  // Dark token backing, ringed in the effect's colour so it reads at a glance.
  g.fillStyle = 'rgba(20,26,34,0.85)'
  g.fillRect(2, 2, 28, 28)
  g.strokeStyle = accent
  g.lineWidth = 2
  g.strokeRect(3, 3, 26, 26)
  g.fillStyle = accent

  if (power === 'freeze') {
    // Six-spoke ice star.
    g.fillRect(15, 7, 2, 18)
    g.fillRect(7, 15, 18, 2)
    for (let i = 0; i < 7; i++) {
      g.fillRect(9 + i * 2, 9 + i * 2, 2, 2)
      g.fillRect(21 - i * 2, 9 + i * 2, 2, 2)
    }
  } else if (power === 'shrink') {
    // Arrows squeezing in from both sides onto a short bar.
    g.fillRect(14, 9, 4, 14)
    for (let i = 0; i < 5; i++) {
      g.fillRect(6 + i, 15 - i, 2, 2 + i * 2)
      g.fillRect(24 - i, 15 - i, 2, 2 + i * 2)
    }
  } else if (power === 'slow') {
    // Clock face with hands at ten-to.
    g.fillRect(10, 6, 12, 2)
    g.fillRect(10, 24, 12, 2)
    g.fillRect(8, 8, 2, 16)
    g.fillRect(22, 8, 2, 16)
    g.fillRect(15, 12, 2, 5)
    g.fillRect(11, 15, 5, 2)
  } else {
    // Shield outline tapering to a point.
    g.fillRect(8, 7, 16, 2)
    g.fillRect(8, 9, 2, 8)
    g.fillRect(22, 9, 2, 8)
    for (let i = 0; i < 6; i++) {
      g.fillRect(10 + i, 17 + i, 2, 2)
      g.fillRect(20 - i, 17 + i, 2, 2)
    }
  }

  const tex = new CanvasTexture(c)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  return tex
}
