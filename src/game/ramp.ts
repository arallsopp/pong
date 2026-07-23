import {
  CatmullRomCurve3,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  RingGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { RAMP_ENTRY_Z } from './const'
import { makeMetalMatcap } from './textures'

export interface Ramp {
  group: Group
  /** The rail centre-line. getPoint(t), t in [0,1], runs +z entry → -z entry. */
  curve: CatmullRomCurve3
  entryZ: number
}

/**
 * A central, bidirectional murderball ramp: the rail rises from one entry mouth,
 * corkscrews once up and over the table (real elevation + a loop), and comes
 * back down to the opposite mouth. Built as two offset tubes (the rails) plus a
 * BAKED ground-shadow ribbon on the floor — the rails are static, so a painted
 * footprint is cheaper and fits the flat bitmap look better than a real
 * shadow-map. The ball's own shadow is dynamic and handled in main.
 */
export function buildRamp(): Ramp {
  const N = 140
  const Zin = RAMP_ENTRY_Z
  const R = 6 // lateral bulge of the corkscrew
  const H = 13 // peak height

  // Parametric corkscrew: one full turn, rising and falling, translating +z→-z.
  const spine: Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = R * Math.sin(Math.PI * t) * Math.cos(2 * Math.PI * t)
    const y = 0.6 + H * Math.sin(Math.PI * t)
    const z = Zin * (1 - 2 * t)
    spine.push(new Vector3(x, y, z))
  }
  const curve = new CatmullRomCurve3(spine, false, 'centripetal')

  const group = new Group()
  const railMat = new MeshMatcapMaterial({ matcap: makeMetalMatcap() })
  const frames = curve.computeFrenetFrames(N, false)
  const gap = 0.75

  for (const side of [-1, 1]) {
    const rail: Vector3[] = []
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N)
      const b = frames.binormals[Math.min(i, N - 1)]
      rail.push(p.clone().addScaledVector(b, side * gap))
    }
    const tube = new TubeGeometry(new CatmullRomCurve3(rail), N, 0.16, 8, false)
    group.add(new Mesh(tube, railMat))
  }

  // Baked ground shadow: the spine projected flat, drawn as a flattened dark
  // ribbon just above the floor.
  const flat = spine.map((p) => new Vector3(p.x, 0, p.z))
  const shadowTube = new TubeGeometry(new CatmullRomCurve3(flat), N, 0.55, 6, false)
  const shadow = new Mesh(
    shadowTube,
    new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  )
  shadow.scale.y = 0.02
  shadow.position.y = 0.04
  group.add(shadow)

  // Entry mouth markers so you can see where to feed the ramp.
  for (const sz of [1, -1]) {
    const ring = new Mesh(
      new RingGeometry(0.9, 1.3, 20),
      new MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.85 }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(0, 0.06, sz * Zin)
    group.add(ring)
  }

  return { group, curve, entryZ: Zin }
}
