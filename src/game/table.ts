import {
  BoxGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Shape,
} from 'three'
import {
  COLOR_ME,
  COLOR_THEM,
  GOAL_HALF,
  HALF_L,
  HALF_W,
  RAMP_FIN_LEN,
  RAMP_FIN_T,
  SLOTS,
  WALL_H,
  WALL_T,
  type Slot,
} from './const'
import { makeFloorTexture } from './floorTexture'
import { makeSteelTexture } from './textures'

const RAIL = 0x6b7f99 // rail cap + machined cut faces
const WALL_FLAT = 0x3c4959 // flat wall tone for the small 45° chamfer faces
const MOUTH_CAP_LEN = 1.6 // length of the owner-coloured lip capping each slot-mouth wall end

/** Build the table: floor plane, side walls, and end walls flanking each goal. */
export function buildTable(): Group {
  const group = new Group()

  // Floor — unlit so the pixel-art texture shows exactly as painted.
  const floor = new Mesh(
    new PlaneGeometry(HALF_W * 2, HALF_L * 2),
    new MeshBasicMaterial({ map: makeFloorTexture() }),
  )
  floor.rotation.x = -Math.PI / 2 // lie flat on XZ
  // Canvas +y (down) should map to table +z (near). After the -90° x-rotation
  // the texture's v axis runs to -z, so flip the plane 180° about y.
  floor.rotation.z = Math.PI
  group.add(floor)

  const railMat = new MeshBasicMaterial({ color: RAIL })
  // The 45° chamfer faces are plain wall steel; seen edge-on from the near-top-down
  // camera a coloured vertical face just clips to a sliver. Instead the OWNER's
  // colour is a lip capping each slot-mouth wall END on top, which reads cleanly
  // from above and tells you the hole is ours (blue) or theirs (pink).
  const chamferMat = new MeshBasicMaterial({ color: WALL_FLAT, side: DoubleSide })
  const capMat: [MeshBasicMaterial, MeshBasicMaterial] = [
    new MeshBasicMaterial({ color: COLOR_ME }),
    new MeshBasicMaterial({ color: COLOR_THEM }),
  ]

  // Side walls. Each is broken at mid-court by a 45° murderball slot: the run on
  // the approach side ends in a flush chamfer (the funnel's open jaw), the run on
  // the other side carries a GUARD BLADE out into the court on the same 45° line,
  // so a ball arriving from the wrong end is turned away instead of fed to the loop.
  for (const s of SLOTS) {
    const inner = s.x
    const outer = s.x + s.sx * WALL_T
    const cap = capMat[s.owner]

    // Run behind the guard blade: its inner face reaches zFin, the outer face
    // stops WALL_T short, and the chamfer between them continues as the blade.
    addRun(group, s, -s.sx * HALF_L, s.zFin - s.sx * WALL_T, railMat)
    addCut(group, chamferMat, [
      [inner, s.zFin],
      [inner, s.zFin - s.sx * WALL_T],
      [outer, s.zFin - s.sx * WALL_T],
    ])

    // Approach-side run: chamfered the same way round, so both cut faces lie
    // parallel to the slot axis and the funnel reads as one aligned throat.
    addRun(group, s, s.zOpen, s.sx * HALF_L, railMat)
    addCut(group, chamferMat, [
      [inner, s.zOpen],
      [outer, s.zOpen],
      [outer, s.zOpen - s.sx * WALL_T],
    ])

    // Owner-coloured lip on each run's slot-mouth end (guard end, then approach
    // end), running back INTO the run away from the throat.
    addMouthCap(group, s, s.zFin - s.sx * WALL_T, -s.sx, cap)
    addMouthCap(group, s, s.zOpen, s.sx, cap)

    addFin(group, s, railMat)
  }

  // End walls: two posts either side of each goal mouth. Each runs from the goal
  // edge out to the OUTER face of the side wall, so the four corners close flush
  // (no little square gap where side wall meets end wall).
  const postLen = HALF_W + WALL_T - GOAL_HALF
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const startX = sx > 0 ? GOAL_HALF : -(HALF_W + WALL_T)
      // Rivets keyed to the post's world x, so they line up across the goal.
      const postMat = new MeshBasicMaterial({ map: makeSteelTexture(postLen, startX) })
      const post = new Mesh(new BoxGeometry(postLen, WALL_H, WALL_T), postMat)
      post.position.set(
        sx * (GOAL_HALF + postLen / 2),
        WALL_H / 2,
        sz * (HALF_L + WALL_T / 2),
      )
      group.add(post)

      // Cap the post top too, so the rail highlight wraps the corner.
      const cap = new Mesh(new BoxGeometry(postLen, 0.15, WALL_T), railMat)
      cap.position.set(sx * (GOAL_HALF + postLen / 2), WALL_H, sz * (HALF_L + WALL_T / 2))
      group.add(cap)
    }
  }

  return group
}

/** One straight length of side wall spanning z = zA..zB, plus its rail cap. */
function addRun(group: Group, s: Slot, zA: number, zB: number, railMat: MeshBasicMaterial) {
  const len = Math.abs(zB - zA)
  const cz = (zA + zB) / 2
  const cx = s.x + (s.sx * WALL_T) / 2
  const wall = new Mesh(
    new BoxGeometry(WALL_T, WALL_H, len),
    new MeshBasicMaterial({ map: makeSteelTexture(len, Math.min(zA, zB)) }),
  )
  wall.position.set(cx, WALL_H / 2, cz)
  group.add(wall)

  const cap = new Mesh(new BoxGeometry(WALL_T, 0.15, len), railMat)
  cap.position.set(cx, WALL_H, cz)
  group.add(cap)
}

/**
 * An owner-coloured lip laid along the TOP of a wall run's slot-mouth end, so the
 * slot reads as ours/theirs from the near-top-down camera. `zEnd` is the run's
 * mouth-facing end; `sInward` (±1) points back into the run, away from the throat.
 * Sits a hair proud of the steel rail cap so it wins the depth test cleanly.
 */
function addMouthCap(group: Group, s: Slot, zEnd: number, sInward: number, mat: MeshBasicMaterial) {
  const cx = s.x + (s.sx * WALL_T) / 2
  const cz = zEnd + (sInward * MOUTH_CAP_LEN) / 2
  const lip = new Mesh(new BoxGeometry(WALL_T, 0.18, MOUTH_CAP_LEN), mat)
  lip.position.set(cx, WALL_H + 0.02, cz)
  group.add(lip)
}

/** The 45° chamfer closing off a run's end: a right-triangle prism, full height. */
function addCut(group: Group, mat: MeshBasicMaterial, pts: [number, number][]) {
  const shape = new Shape()
  shape.moveTo(pts[0][0], -pts[0][1]) // shape y runs -z, undone by the rotate below
  shape.lineTo(pts[1][0], -pts[1][1])
  shape.lineTo(pts[2][0], -pts[2][1])
  shape.closePath()
  const geo = new ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2) // extrude along +y; shape y → world -z
  group.add(new Mesh(geo, mat))
}

/** The guard blade: a wall stub on the slot's far jaw line, jutting into the court. */
function addFin(group: Group, s: Slot, railMat: MeshBasicMaterial) {
  const len = RAMP_FIN_LEN + WALL_T
  const cx = (s.fin.x0 + s.fin.x1) / 2
  const cz = (s.fin.z0 + s.fin.z1) / 2
  const yaw = Math.atan2(s.ax, s.az) // local +z → the slot axis

  const blade = new Mesh(
    new BoxGeometry(RAMP_FIN_T, WALL_H, len),
    new MeshBasicMaterial({ map: makeSteelTexture(len) }),
  )
  blade.position.set(cx, WALL_H / 2, cz)
  blade.rotation.y = yaw
  group.add(blade)

  const cap = new Mesh(new BoxGeometry(RAMP_FIN_T, 0.15, len), railMat)
  cap.position.set(cx, WALL_H, cz)
  cap.rotation.y = yaw
  group.add(cap)
}
