import { Vector3 } from 'three'

export type Zone = 'court' | 'near' | 'far'

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Every arena shape reduces to these operations so the physics never branches
 * on shape. Convention: +z points from our end (near, at +z) toward theirs
 * (far, at -z). The camera / player paddle live at the +z end.
 */
export interface Arena {
  readonly depth: number

  /** Signed distance to the court boundary; negative inside, positive outside. */
  sdf(p: Vector3): number

  /** Outward (pointing out of the play volume) unit normal near point p. */
  normalAt(p: Vector3, out: Vector3): Vector3

  /** Which region p falls in. */
  zoneAt(p: Vector3): Zone

  /** Legal paddle-centre bounds in the plane at depth z. */
  paddleBounds(z: number): Bounds

  /** Build (or return) the Three.js object representing this arena. */
  buildMesh(): import('three').Object3D
}
