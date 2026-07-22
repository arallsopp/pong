# First-Person Pong — Design Spec

A mobile-first PWA. The screen is your bat. You defend one end of a 3D arena
against an AI opponent at the other end.

## Core loop

The ball travels down the arena toward you. You slide your paddle (and therefore
your viewport) up/down/left/right to intercept it. Where on your convex paddle
the ball lands determines the return angle. Bounce off any court surface is
legal; the ball reaching your end plate loses you the point.

## Decisions

| Area | Decision |
|---|---|
| Opponent | Solo vs AI in v1. Netcode designed for, not built. |
| Controls | Thumb-zone virtual stick, translating the paddle in its plane. |
| Camera | Rigidly locked to the paddle. Moving the stick moves the world. |
| Aiming | Hit-offset only. Contact-point normal on the convex surface sets the bounce. |
| Arenas | All three from day one, behind a common interface. |
| Stack | Three.js + Vite + TypeScript. |
| Match | First to 5, best of 3 sets. Arena shape changes between sets. |
| Pacing | Ball gains ~3% speed per paddle hit; resets on point. |
| Art | Neon vector / Tron. Black void, emissive wireframe, bloom. |
| Obstacles | Static + moving on deterministic paths. |
| PWA | Fully offline playable after first load. |

## Physics

No gravity. The ball is a point mass with a radius, travelling in straight lines
between collisions. Collision response is a pure reflection about the surface
normal, plus a restitution coefficient (1.0 on court walls — no energy loss —
and a small boost on paddle contact to drive the per-rally speed ramp).

Integration is a fixed 120Hz substep with continuous collision detection against
the arena's implicit surface, so a fast ball can never tunnel through a wall.
Rendering interpolates between substeps.

### Arena interface

Every arena shape reduces to three operations, which is what makes all three
shippable at once:

```ts
interface Arena {
  // Signed distance from p to the court boundary; negative = inside.
  sdf(p: Vec3): number
  // Outward surface normal at the nearest boundary point to p.
  normalAt(p: Vec3): Vec3
  // Which region p falls in — court, our end zone, or theirs.
  zoneAt(p: Vec3): 'court' | 'near' | 'far'
  // Legal paddle positions at depth z, for clamping player and AI movement.
  paddleBounds(z: number): Bounds
}
```

- **Rectangular prism** — six planes. End caps at ±z are the goals, four side
  walls are court.
- **Circular prism** — a cylinder. Radial normal on the side wall, flat caps at
  ±z are the goals.
- **Globe** — a sphere. The polar caps beyond ±0.8 of the radius on the z axis
  are the goals; the 60% equatorial band is court. Normals are radial
  everywhere. Paddles are spherical caps that slide across the goal region.

## Scale

Anchored to the requirement that the ball reads as 33% of screen height at
closest approach. Working backwards from a ~50° vertical FOV, that fixes the
ball radius relative to arena depth. Concretely: arena depth 40 units, ball
radius 0.9 units, paddle plane ~4 units in front of the camera. These get tuned
by eye once it's running.

## Depth cues

First-person plus an incoming ball makes depth genuinely hard to read. Four
cues, layered:

1. **Ball trail** — a fading ribbon behind the ball.
2. **Wall shadow** — a projected marker tracking the ball's position on the
   nearest court surface.
3. **Court grid lines** — regular banding down the arena so distance and speed
   read against a known scale. Doubles as the fixed horizon reference the rigid
   camera needs to stay legible.
4. **Impact reticle** — a predicted contact crosshair on the paddle plane.
   Difficulty-gated: always on at easy, fades out at hard.

## Open questions

- Orientation: assuming portrait lock. Landscape gives a wider court but a worse
  thumb reach.
- Whether the rigid camera needs a subtle roll or FOV kick on fast movement to
  sell the motion, or whether that tips into nausea.
- AI difficulty model — reaction latency plus aim error is the plan, but the
  exact curve needs playtesting.
