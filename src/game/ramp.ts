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
import { makeMetalMatcap } from './textures'

export interface Ramp {
  group: Group
  curve: CatmullRomCurve3 // open; getPoint(u), u in [0,1]
  length: number
  /** Ball-centre position riding on top of the rails at param u. */
  ride(u: number, out: Vector3): Vector3
  /** The two inner-tip mouths (table-plane x/z), at u=0 and u=1. */
  entryPoints: { x: number; z: number }[]
}

// Top-down control points (x = width, z = length), tracing entry-tip → left
// spiral (out past the wall) → central S → right spiral → exit-tip. 180°
// point-symmetric. Spirals reach |x|≈13, beyond the walls at ±10.
const CP: [number, number][] = [
  [-6, 0.5], // A  entry tip (near centre-left)
  [-9, 4],
  [-13, 0.5], // far left, beyond the wall
  [-10, -4.5],
  [-6, -3], // leaving the left spiral into the S
  [0, 0], // S crosses table centre
  [6, 3], // entering the right spiral
  [10, 4.5],
  [13, -0.5], // far right, beyond the wall
  [9, -4],
  [6, -0.5], // A' exit tip (near centre-right)
]

// Chaikin corner-cutting passes applied to the control polygon before the
// spline is fit. Each pass rounds every corner (converging to a quadratic
// B-spline), which is what kills the kinks in the tight spiral turns. More
// passes = smoother but the spirals pull in slightly (corners get cut). 2–3 is
// the sweet spot; the endpoints (the entry tips) are always preserved exactly.
const SMOOTH_ITERS = 3

const GAP = 1.4 // fixed distance between the two rods
const RIDE_H = 0.62 // ball-centre height above the rail centre-line (sits on top)
const RAIL_R = 0.14
const BANK_GAIN = 12
const MAX_BANK = 0.6 // radians (~34°)
const PEAK = 5 // plateau height of the aerial section (clears the 3.5 walls)
const APEX = 2 // extra lift at the centre → highest point over the table
const N = 320

/** Height along the path: low at both tips, up onto a plateau, apex over centre. */
function heightAt(p: number): number {
  let base: number
  if (p < 0.12) base = lerp(0.2, PEAK, smooth(p / 0.12))
  else if (p > 0.88) base = lerp(PEAK, 0.2, smooth((p - 0.88) / 0.12))
  else base = PEAK
  return base + APEX * Math.sin(Math.PI * p)
}

/**
 * Open S-with-spirals murderball ramp, built as a banked railed track: two rods
 * a fixed distance apart, banked into the corners so the marble riding on top is
 * held through the curls. A stable tangent×up frame avoids Frenet flips; bank
 * angle scales with how hard the track turns. Enters/exits at the inner tips.
 */
export function buildRamp(): Ramp {
  // Smooth the sparse control polygon first (rounds the spiral kinks), then fit
  // the plane curve through the denser, rounder result.
  const planePts = chaikin(CP, SMOOTH_ITERS).map(([x, z]) => new Vector3(x, 0, z))
  const planeCurve = new CatmullRomCurve3(planePts, false, 'centripetal')
  const spine: Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const p = i / N
    const q = planeCurve.getPoint(p)
    q.y = heightAt(p)
    spine.push(q)
  }
  const curve = new CatmullRomCurve3(spine, false, 'centripetal')

  const up0 = new Vector3(0, 1, 0)
  const t0 = new Vector3()
  const t1 = new Vector3()
  const side = new Vector3()
  const locUp = new Vector3()
  const railL: Vector3[] = []
  const railR: Vector3[] = []
  const ridePoints: Vector3[] = []

  for (let i = 0; i <= N; i++) {
    const u = i / N
    const p = curve.getPoint(u)
    curve.getTangent(u, t0).normalize()
    curve.getTangent(Math.min(u + 1 / N, 1), t1).normalize()
    const dT = t1.clone().sub(t0)

    side.crossVectors(t0, up0)
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
    side.normalize()
    locUp.crossVectors(side, t0).normalize()

    const theta = clampN(-BANK_GAIN * dT.dot(side), -MAX_BANK, MAX_BANK)
    const c = Math.cos(theta)
    const s = Math.sin(theta)
    const bs = side.clone().multiplyScalar(c).addScaledVector(locUp, s)
    const bu = locUp.clone().multiplyScalar(c).addScaledVector(side, -s)

    railL.push(p.clone().addScaledVector(bs, GAP / 2))
    railR.push(p.clone().addScaledVector(bs, -GAP / 2))
    ridePoints.push(p.clone().addScaledVector(bu, RIDE_H))
  }

  const group = new Group()
  const railMat = new MeshMatcapMaterial({ matcap: makeMetalMatcap() })
  for (const rail of [railL, railR]) {
    const tube = new TubeGeometry(new CatmullRomCurve3(rail, false), N, RAIL_R, 8, false)
    group.add(new Mesh(tube, railMat))
  }

  // Entry-tip markers.
  const tips = [CP[0], CP[CP.length - 1]]
  for (const [x, z] of tips) {
    const ring = new Mesh(
      new RingGeometry(0.8, 1.2, 20),
      new MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.85 }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.06, z)
    group.add(ring)
  }

  const ride = (u: number, out: Vector3): Vector3 => {
    const f = clampN(u, 0, 1) * N
    const i0 = Math.floor(f)
    const i1 = Math.min(i0 + 1, N)
    return out.lerpVectors(ridePoints[i0], ridePoints[i1], f - i0)
  }

  return {
    group,
    curve,
    length: curve.getLength(),
    ride,
    entryPoints: [
      { x: CP[0][0], z: CP[0][1] },
      { x: CP[CP.length - 1][0], z: CP[CP.length - 1][1] },
    ],
  }
}

/**
 * Chaikin corner-cutting: replace each segment with its 1/4 and 3/4 points,
 * keeping the first/last vertices exactly (so the entry tips don't move). Each
 * pass roughly doubles the point count and rounds every corner.
 */
function chaikin(pts: [number, number][], iterations: number): [number, number][] {
  let p = pts
  for (let k = 0; k < iterations; k++) {
    const out: [number, number][] = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i]
      const [bx, bz] = p[i + 1]
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25])
      out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75])
    }
    out.push(p[p.length - 1])
    p = out
  }
  return p
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}
function clampN(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
