import {
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  BoxGeometry,
  Vector3,
} from 'three'
import type { Arena, Bounds, Zone } from './Arena'

/**
 * Rectangular prism. Four side walls are court; the ±z end caps are goals
 * (near = ours, far = theirs). Half-extents hx, hy in the cross-section; the
 * arena runs from z = -depth/2 (far) to z = +depth/2 (near).
 */
export class RectArena implements Arena {
  readonly depth: number
  readonly hx: number
  readonly hy: number
  /** Fraction of depth at each end that counts as the goal zone. */
  readonly endFrac = 0.08

  constructor(hx = 12, hy = 20, depth = 40) {
    this.hx = hx
    this.hy = hy
    this.depth = depth
  }

  private get halfD() {
    return this.depth / 2
  }

  sdf(p: Vector3): number {
    // Distance to the inside of the four side walls only. The end caps are goal
    // planes, not bounce surfaces, so they don't participate in the court SDF.
    const dx = Math.abs(p.x) - this.hx
    const dy = Math.abs(p.y) - this.hy
    return Math.max(dx, dy)
  }

  normalAt(p: Vector3, out: Vector3): Vector3 {
    const dx = this.hx - Math.abs(p.x)
    const dy = this.hy - Math.abs(p.y)
    // Nearest side wall wins.
    if (dx < dy) {
      out.set(Math.sign(p.x), 0, 0)
    } else {
      out.set(0, Math.sign(p.y), 0)
    }
    return out
  }

  zoneAt(p: Vector3): Zone {
    const nearPlane = this.halfD - this.endFrac * this.depth
    const farPlane = -this.halfD + this.endFrac * this.depth
    if (p.z >= nearPlane) return 'near'
    if (p.z <= farPlane) return 'far'
    return 'court'
  }

  paddleBounds(_z: number): Bounds {
    return { minX: -this.hx, maxX: this.hx, minY: -this.hy, maxY: this.hy }
  }

  buildMesh() {
    const group = new Group()
    const geo = new BoxGeometry(this.hx * 2, this.hy * 2, this.depth)
    const edges = new EdgesGeometry(geo)
    const mat = new LineBasicMaterial({ color: 0x22d3ee })
    group.add(new LineSegments(edges, mat))

    // Court grid banding down the length — depth cue + fixed reference.
    group.add(this.buildGrid())
    return group
  }

  private buildGrid(): LineSegments {
    const pts: number[] = []
    const rings = 16
    for (let i = 1; i < rings; i++) {
      const z = -this.halfD + (this.depth * i) / rings
      // Rectangle ring at this z.
      const c = [
        [-this.hx, -this.hy],
        [this.hx, -this.hy],
        [this.hx, this.hy],
        [-this.hx, this.hy],
      ]
      for (let k = 0; k < 4; k++) {
        const a = c[k]
        const b = c[(k + 1) % 4]
        pts.push(a[0], a[1], z, b[0], b[1], z)
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
    const mat = new LineBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.5 })
    return new LineSegments(geo, mat)
  }
}
