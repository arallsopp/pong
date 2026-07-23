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
export const DISABLE_SECONDS = 3

let gunTex: CanvasTexture | null = null

/** A flat pixel-art gun pickup token, laid on the table. */
export function makeGunMesh(): Mesh {
  if (!gunTex) gunTex = makeGunTexture()
  const m = new Mesh(
    new PlaneGeometry(2.2, 2.2),
    new MeshBasicMaterial({ map: gunTex, transparent: true }),
  )
  m.rotation.x = -Math.PI / 2
  return m
}

/** A short glowing laser bolt that travels up-court. */
export function makeShotMesh(): Mesh {
  return new Mesh(
    new BoxGeometry(0.35, 0.35, 1.6),
    new MeshBasicMaterial({ color: 0x8affc0 }),
  )
}

function makeGunTexture(): CanvasTexture {
  const S = 32
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = false

  // Dark rounded token backing with a bright ring.
  g.fillStyle = 'rgba(20,26,34,0.85)'
  g.fillRect(2, 2, 28, 28)
  g.strokeStyle = '#8affc0'
  g.lineWidth = 2
  g.strokeRect(3, 3, 26, 26)

  // Simple pixel pistol in amber.
  g.fillStyle = '#ffe066'
  g.fillRect(7, 12, 16, 5) // barrel/body
  g.fillRect(20, 12, 4, 3) // muzzle
  g.fillRect(10, 17, 5, 7) // grip
  g.fillStyle = '#20262f'
  g.fillRect(9, 13, 2, 2) // sight detail

  const tex = new CanvasTexture(c)
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.colorSpace = SRGBColorSpace
  return tex
}
