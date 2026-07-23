import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import { GOAL_HALF, HALF_L, HALF_W, WALL_H, WALL_T } from './const'
import { makeFloorTexture } from './floorTexture'

const STEEL = 0x46566b
const RAIL = 0x6b7f99

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

  const wallMat = new MeshBasicMaterial({ color: STEEL })
  const railMat = new MeshBasicMaterial({ color: RAIL })

  // Side walls (full length).
  for (const sx of [-1, 1]) {
    const w = new Mesh(new BoxGeometry(WALL_T, WALL_H, HALF_L * 2), wallMat)
    w.position.set(sx * (HALF_W + WALL_T / 2), WALL_H / 2, 0)
    group.add(w)
    // A thin rail cap for a bit of edge highlight.
    const cap = new Mesh(new BoxGeometry(WALL_T, 0.15, HALF_L * 2), railMat)
    cap.position.set(sx * (HALF_W + WALL_T / 2), WALL_H, 0)
    group.add(cap)
  }

  // End walls: two posts either side of each goal mouth.
  const postLen = HALF_W - GOAL_HALF
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(postLen, WALL_H, WALL_T), wallMat)
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
