import {
  CatmullRomCurve3,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  RingGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { makeMetalMatcap } from './textures'
import { BALL_R, COLOR_ME, COLOR_THEM, HALF_W, RAMP_HOLE_Z } from './const'

export interface Ramp {
  group: Group
  curve: CatmullRomCurve3 // open; getPoint(u), u in [0,1] runs right mouth → left mouth
  length: number
  /** Ball-centre position riding the rails at param u. */
  ride(u: number, out: Vector3): Vector3
  /** The two wall mouths (table-plane x/z): [0] = right/ours (u=0), [1] = left/theirs (u=1). */
  entryPoints: { x: number; z: number }[]
}

// --- Shape (tune here). Twin-wire pinball rail. It leaves a slot in the RIGHT
// wall, corkscrews a full loop up the OUTSIDE of the wall, arcs over the top of
// the table (apex at centre), then corkscrews a full loop down into a slot in
// the LEFT wall. Point-symmetric → smooth Catmull-Rom, no kinks. ---
const R = 2.6 // corkscrew radius (loops sit outside the side wall)
const MOUTH_Y = BALL_R // mouth height = rolling-ball height for a seamless entry
const CROSS_Y = 6.0 // height reached after one ascent loop (clears the 3.5 walls)
const PEAK_Y = 8.2 // apex height over table centre
const LOOP_PTS = 12 // control points per corkscrew loop (roundness)
const GAP = 1.1 // spacing between the two wires
const RAIL_R = 0.12 // wire thickness
const RIDE_LIFT = BALL_R * 0.6 // ball sits above the wires, nestled between them
const N = 320

const RIGHT_MOUTH = { x: HALF_W, z: RAMP_HOLE_Z }
const LEFT_MOUTH = { x: -HALF_W, z: -RAMP_HOLE_Z }

export function buildRamp(): Ramp {
  const cp = buildControlPoints()
  const curve = new CatmullRomCurve3(cp, false, 'centripetal')

  // Sample the spine, then lay two parallel wires either side of it using a
  // stable tangent×up frame; the ball rides on top of the pair.
  const worldUp = new Vector3(0, 1, 0)
  const railL: Vector3[] = []
  const railR: Vector3[] = []
  const ridePoints: Vector3[] = []
  const t = new Vector3()
  const side = new Vector3()
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const p = curve.getPoint(u)
    curve.getTangent(u, t).normalize()
    side.crossVectors(t, worldUp)
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
    side.normalize()
    railL.push(p.clone().addScaledVector(side, GAP / 2))
    railR.push(p.clone().addScaledVector(side, -GAP / 2))
    ridePoints.push(p.clone().addScaledVector(worldUp, RIDE_LIFT))
  }

  const group = new Group()
  const railMat = new MeshMatcapMaterial({ matcap: makeMetalMatcap() })
  for (const rail of [railL, railR]) {
    const tube = new TubeGeometry(new CatmullRomCurve3(rail, false), N, RAIL_R, 8, false)
    group.add(new Mesh(tube, railMat))
  }

  // Wall-mouth portals: dark disc (the slot) ringed in the owner's colour.
  addPortal(group, RIGHT_MOUTH.x - 0.05, MOUTH_Y, RIGHT_MOUTH.z, -Math.PI / 2, COLOR_ME)
  addPortal(group, LEFT_MOUTH.x + 0.05, MOUTH_Y, LEFT_MOUTH.z, Math.PI / 2, COLOR_THEM)

  const ride = (u: number, out: Vector3): Vector3 => {
    const f = Math.max(0, Math.min(1, u)) * N
    const i0 = Math.floor(f)
    const i1 = Math.min(i0 + 1, N)
    return out.lerpVectors(ridePoints[i0], ridePoints[i1], f - i0)
  }

  return {
    group,
    curve,
    length: curve.getLength(),
    ride,
    entryPoints: [{ ...RIGHT_MOUTH }, { ...LEFT_MOUTH }],
  }
}

/** Right ascent corkscrew → overhead crossover → left descent corkscrew. */
function buildControlPoints(): Vector3[] {
  // Right corkscrew winds around a vertical axis just OUTSIDE the right wall, so
  // its inner edge touches the wall (x = HALF_W) and never intrudes on the court.
  const cx = HALF_W + R
  const ascent: Vector3[] = []
  for (let k = 0; k <= LOOP_PTS; k++) {
    const th = (k / LOOP_PTS) * Math.PI * 2
    ascent.push(
      new Vector3(
        cx - R * Math.cos(th), // k=0 → HALF_W (the wall mouth)
        MOUTH_Y + (CROSS_Y - MOUTH_Y) * (k / LOOP_PTS),
        RAMP_HOLE_Z - R * Math.sin(th), // tangent at k=0 points −z (into the ramp)
      ),
    )
  }

  // Crossover: right-high → apex over centre → left-high.
  const cross = [
    new Vector3(HALF_W * 0.5, PEAK_Y * 0.98, RAMP_HOLE_Z * 0.5),
    new Vector3(0, PEAK_Y, 0),
    new Vector3(-HALF_W * 0.5, PEAK_Y * 0.98, -RAMP_HOLE_Z * 0.5),
  ]

  // Left descent = point-symmetric mirror of the ascent (x,z → −x,−z), reversed
  // so it runs high → low into the left mouth. Skip k=0 (it's the crossover end).
  const descent: Vector3[] = []
  for (let k = 1; k <= LOOP_PTS; k++) {
    const a = ascent[LOOP_PTS - k]
    descent.push(new Vector3(-a.x, a.y, -a.z))
  }

  return [...ascent, ...cross, ...descent]
}

function addPortal(group: Group, x: number, y: number, z: number, facing: number, color: number) {
  const disc = new Mesh(
    new CircleGeometry(0.95, 24),
    new MeshBasicMaterial({ color: 0x05070a, side: DoubleSide }),
  )
  disc.rotation.y = facing
  disc.position.set(x, y, z)
  group.add(disc)

  const ring = new Mesh(
    new RingGeometry(0.95, 1.25, 24),
    new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.9 }),
  )
  ring.rotation.y = facing
  ring.position.set(x, y, z)
  group.add(ring)
}
