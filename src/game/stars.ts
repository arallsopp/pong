import {
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three'
import { COLOR_ME, COLOR_THEM, SLOTS, TARGET_SEP, WALL_H } from './const'

const RING = 0x9fb4cc // always-visible steel outline so empty targets read clearly
const EMPTY = 0x0a0d12 // near-black fill when unclaimed
const R_OUT = 0.82
const R_IN = 0.58
const TARGET_Y = WALL_H * 0.5

export interface Targets {
  group: Group
  /** World x/z of each target (for hit-testing the ball against the wall). */
  positions: { x: number; z: number }[]
  /** Who owns each target: 0 = us, 1 = them, null = unclaimed. */
  claims: (0 | 1 | null)[]
  /** Claim a target for a side, recolouring its fill. */
  claim(i: number, owner: 0 | 1): void
  /** How many targets a side currently holds (its next-goal multiplier). */
  countFor(owner: 0 | 1): number
  /** Reset every target to unclaimed (after a goal). */
  reset(): void
}

/**
 * Four claim targets: two evenly spaced either side of each wall slot. All start
 * black with a visible steel ring; hitting one lights it your colour. It's not
 * tug-of-war — you light up as many as you can, and your count is your multiplier
 * when you next score, after which they all reset.
 */
export function buildTargets(): Targets {
  const group = new Group()

  const layout: { x: number; z: number }[] = SLOTS.flatMap((s) => [
    { x: s.x - s.sx * 0.06, z: s.z - TARGET_SEP },
    { x: s.x - s.sx * 0.06, z: s.z + TARGET_SEP },
  ])

  const fills: Mesh[] = []
  const claims: (0 | 1 | null)[] = layout.map(() => null)

  for (const p of layout) {
    const facing = p.x > 0 ? -Math.PI / 2 : Math.PI / 2 // face into the court

    const ring = new Mesh(
      new RingGeometry(R_IN, R_OUT, 24),
      new MeshBasicMaterial({ color: RING, side: DoubleSide }),
    )
    ring.rotation.y = facing
    ring.position.set(p.x, TARGET_Y, p.z)
    group.add(ring)

    const fill = new Mesh(
      new CircleGeometry(R_IN, 24),
      new MeshBasicMaterial({ color: EMPTY, side: DoubleSide }),
    )
    fill.rotation.y = facing
    fill.position.set(p.x, TARGET_Y, p.z)
    group.add(fill)
    fills.push(fill)
  }

  const paint = (i: number) => {
    const c = claims[i] === 0 ? COLOR_ME : claims[i] === 1 ? COLOR_THEM : EMPTY
    ;(fills[i].material as MeshBasicMaterial).color.set(c)
    fills[i].scale.setScalar(claims[i] === null ? 1 : 1.12)
  }

  return {
    group,
    positions: layout.map((p) => ({ x: p.x, z: p.z })),
    claims,
    claim(i, owner) {
      claims[i] = owner
      paint(i)
    },
    countFor(owner) {
      let n = 0
      for (const c of claims) if (c === owner) n++
      return n
    },
    reset() {
      for (let i = 0; i < claims.length; i++) {
        claims[i] = null
        paint(i)
      }
    },
  }
}
