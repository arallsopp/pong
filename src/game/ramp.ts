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
import { BALL_R, COLOR_ME, COLOR_THEM, SLOTS, type Slot } from './const'

export interface Ramp {
  group: Group
  curve: CatmullRomCurve3 // open; getPoint(u), u in [0,1] runs right mouth → left mouth
  length: number
  /** Ball-centre position riding the rails at param u. */
  ride(u: number, out: Vector3): Vector3
}

// --- Shape (tune here). Twin-wire pinball rail. It leaves the 45° slot in the
// RIGHT wall at mid-court, corkscrews up the OUTSIDE of the wall, arcs over the
// top of the table (apex at centre), then corkscrews down into the mirrored slot
// in the LEFT wall. Point-symmetric → smooth Catmull-Rom, no kinks. ---
const R = 1.8 // corkscrew radius (loops sit just outside the side wall)
const LOOP_TURNS = 1.625 // turns before heading inland; the extra ⅝ turn aims it at the apex
const MOUTH_Y = BALL_R // mouth height = rolling-ball height for a seamless entry
const CROSS_Y = 6.0 // height reached at the end of the corkscrew (clears the 3.5 walls)
const CLIMB_EASE = 1.7 // >1 front-loads the climb, so the turn that passes back over
//                        the wall is already well clear of it
const PEAK_Y = 8.2 // apex height over table centre
const CROSS_PULL = 0.45 // how far in from the corkscrew the arch's first point sits
const LOOP_PTS = 12 // control points per full turn (roundness)
const GAP = 1.1 // spacing between the two wires
const RAIL_R = 0.12 // wire thickness
const RIDE_LIFT = BALL_R * 0.6 // ball sits above the wires, nestled between them
const N = 320

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

  // Slot portals: a dark disc across the throat, ringed in the owner's colour,
  // square to the 45° slot axis.
  addPortal(group, SLOTS[0], COLOR_ME)
  addPortal(group, SLOTS[1], COLOR_THEM)

  const ride = (u: number, out: Vector3): Vector3 => {
    const f = Math.max(0, Math.min(1, u)) * N
    const i0 = Math.floor(f)
    const i1 = Math.min(i0 + 1, N)
    return out.lerpVectors(ridePoints[i0], ridePoints[i1], f - i0)
  }

  return { group, curve, length: curve.getLength(), ride }
}

/** Right ascent corkscrew → overhead crossover → mirrored left descent. */
function buildControlPoints(): Vector3[] {
  const s = SLOTS[0] // ours, the right wall
  // The corkscrew winds around a vertical axis one radius along the slot's cross
  // normal, so the rail leaves the mouth travelling exactly along the slot axis
  // — the ball flies straight in off the table with no corner to catch.
  const cx = s.x + s.nx * R
  const cz = s.z + s.nz * R
  const steps = Math.round(LOOP_PTS * LOOP_TURNS)

  const ascent: Vector3[] = []
  for (let k = 0; k <= steps; k++) {
    const f = k / steps
    const th = f * LOOP_TURNS * Math.PI * 2
    ascent.push(
      new Vector3(
        cx + R * (-s.nx * Math.cos(th) + s.ax * Math.sin(th)), // k=0 → the wall mouth
        MOUTH_Y + (CROSS_Y - MOUTH_Y) * (1 - Math.pow(1 - f, CLIMB_EASE)),
        cz + R * (-s.nz * Math.cos(th) + s.az * Math.sin(th)),
      ),
    )
  }

  // Crossover: corkscrew top → apex over centre → point-symmetric mirror.
  const end = ascent[steps]
  const cross = [
    new Vector3(end.x * CROSS_PULL, PEAK_Y * 0.97, end.z * CROSS_PULL),
    new Vector3(0, PEAK_Y, 0),
    new Vector3(-end.x * CROSS_PULL, PEAK_Y * 0.97, -end.z * CROSS_PULL),
  ]

  // Left descent = the ascent mirrored through the table centre (x,z → −x,−z)
  // and reversed, so it runs high → low into the left mouth.
  const descent: Vector3[] = []
  for (let k = steps; k >= 0; k--) {
    const a = ascent[k]
    descent.push(new Vector3(-a.x, a.y, -a.z))
  }

  return [...ascent, ...cross, ...descent]
}

function addPortal(group: Group, s: Slot, color: number) {
  const yaw = Math.atan2(s.ax, s.az) // disc normal → the slot axis
  // Sit the portal a touch inside the throat so it can't z-fight the wall runs.
  const x = s.x - s.ax * 0.05
  const z = s.z - s.az * 0.05

  const disc = new Mesh(
    new CircleGeometry(0.95, 24),
    new MeshBasicMaterial({ color: 0x05070a, side: DoubleSide }),
  )
  disc.rotation.y = yaw
  disc.position.set(x, MOUTH_Y, z)
  group.add(disc)

  const ring = new Mesh(
    new RingGeometry(0.95, 1.25, 24),
    new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0.9 }),
  )
  ring.rotation.y = yaw
  ring.position.set(x, MOUTH_Y, z)
  group.add(ring)
}
