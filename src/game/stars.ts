import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three'
import { HALF_W, WALL_H } from './const'

const LIT = 0xffcc33
const DIM = 0x40506a
const STAR_R = 0.85
const STAR_Y = WALL_H * 0.55
const STAR_Z = [-8, -4, 0, 4, 8] // index 0 = opponent side (−z), 4 = our side (+z)

export interface StarTrack {
  group: Group
  /** Light exactly one star for the current balance (−2..+2). */
  setBalance(balance: number): void
  /** World x/z of each star, for hit-testing against the ball at the wall. */
  positions: { x: number; z: number }[]
}

/**
 * The five-star tug-of-war track on the left wall. A single lit star marks the
 * balance (−2..+2), starting centred. main moves it: the ball's last hitter
 * nudges it toward their side when it strikes a star.
 */
export function buildStars(): StarTrack {
  const group = new Group()
  const shape = starShape(STAR_R, STAR_R * 0.42)
  const meshes: Mesh[] = []
  const x = -HALF_W + 0.06

  for (const z of STAR_Z) {
    const m = new Mesh(
      new ShapeGeometry(shape),
      new MeshBasicMaterial({ color: DIM, side: DoubleSide }),
    )
    m.rotation.y = Math.PI / 2 // face +x (into the court, off the left wall)
    m.position.set(x, STAR_Y, z)
    group.add(m)
    meshes.push(m)
  }

  const setBalance = (balance: number) => {
    const lit = Math.max(0, Math.min(4, balance + 2))
    meshes.forEach((m, i) => {
      ;(m.material as MeshBasicMaterial).color.set(i === lit ? LIT : DIM)
      m.scale.setScalar(i === lit ? 1.25 : 1)
    })
  }
  setBalance(0)

  return {
    group,
    setBalance,
    positions: STAR_Z.map((z) => ({ x, z })),
  }
}

function starShape(outer: number, inner: number): Shape {
  const s = new Shape()
  const v = new Vector3()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    v.set(Math.cos(a) * r, Math.sin(a) * r, 0)
    if (i === 0) s.moveTo(v.x, v.y)
    else s.lineTo(v.x, v.y)
  }
  s.closePath()
  return s
}
