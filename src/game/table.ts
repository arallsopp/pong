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
  const cutMat = new MeshBasicMaterial({ color: RAIL, side: DoubleSide })

  // Side walls. Each is broken at mid-court by a 45° murderball slot: the run on
  // the approach side ends in a flush chamfer (the funnel's open jaw), the run on
  // the other side carries a GUARD BLADE out into the court on the same 45° line,
  // so a ball arriving from the wrong end is turned away instead of fed to the loop.
  for (const s of SLOTS) {
    const inner = s.x
    const outer = s.x + s.sx * WALL_T

    // Run behind the guard blade: its inner face reaches zFin, the outer face
    // stops WALL_T short, and the chamfer between them continues as the blade.
    addRun(group, s, -s.sx * HALF_L, s.zFin - s.sx * WALL_T, railMat)
    addCut(group, cutMat, [
      [inner, s.zFin],
      [inner, s.zFin - s.sx * WALL_T],
      [outer, s.zFin - s.sx * WALL_T],
    ])

    // Approach-side run: chamfered the same way round, so both cut faces lie
    // parallel to the slot axis and the funnel reads as one aligned throat.
    addRun(group, s, s.zOpen, s.sx * HALF_L, railMat)
    addCut(group, cutMat, [
      [inner, s.zOpen],
      [outer, s.zOpen],
      [outer, s.zOpen - s.sx * WALL_T],
    ])

    addFin(group, s, railMat)
  }

  // End walls: two posts either side of each goal mouth.
  const postLen = HALF_W - GOAL_HALF
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      // Rivets keyed to the post's world x, so they line up across the goal.
      const postMat = new MeshBasicMaterial({
        map: makeSteelTexture(postLen, sx > 0 ? GOAL_HALF : -HALF_W),
      })
      const post = new Mesh(new BoxGeometry(postLen, WALL_H, WALL_T), postMat)
      post.position.set(
        sx * (GOAL_HALF + postLen / 2),
        WALL_H / 2,
        sz * (HALF_L + WALL_T / 2),
      )
      group.add(post)
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
