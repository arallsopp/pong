# Murderball — Design Spec

A mobile-first PWA. Top-down air-hockey with pinball mechanics, in a 16-bit
Bitmap-Brothers visual style. You defend the bottom goal against an AI at the
top. Score into their goal; most goals when the clock runs out wins.

> Supersedes the earlier first-person 3D Pong (still in git history / deployed).
> This is a fresh build; only the fixed-timestep loop and reflection math carry
> over.

## View & render

- **3D scene, fixed tilted-top-down camera.** Portrait. Our goal near/bottom
  (+z), theirs far/top (-z).
- **Full-screen pixelation.** The scene renders to a low internal resolution and
  is nearest-upscaled to the display, so edges, motion and the ball all read as
  genuinely 16-bit. Textures use NearestFilter, materials are unlit/flat.

## Art direction

Reference: Bitmap Brothers / Speedball 2.
- **Floor:** metal blue, rivet dot-grid, a large lavender 5-point star, a green
  center line, a center face-off circle + square.
- **HUD:** amber pixel font on a steel panel ("MATCH OVER / SCORE 010 TO 022").
- **Paddles:** flat discs. Ours blue, theirs orange (echoing the reference).

## Physics

Custom 2D on the table plane (x = width, z = length). No gravity. The ball is a
circle; walls and paddles reflect it (restitution ~1). A moving paddle imparts
its velocity, so you can carry and flick. Fixed 120 Hz substeps; render
interpolates. A separate **height channel (y)** is used only while the ball is
on the ramp.

- **Walls:** side walls full length; end walls in two posts either side of the
  goal mouth.
- **Goals:** ball fully through a goal mouth scores for the attacker.
- **Paddle:** confined to its own half (cannot cross the center line).

## Controls

**Direct touch-drag.** The paddle tracks your fingertip (raycast to the table
plane), clamped to your half. Its frame-to-frame motion becomes its velocity for
imparting to the ball.

## Mechanics

### Tug-of-war multiplier
Five stars on the side wall are a single shared pointer over `[-2,-1,0,+1,+2]`,
starting at 0. Hitting a star with the ball nudges the pointer one step toward
your side; the opponent nudges it back and then toward theirs. Whoever the
pointer favors adds that many bonus points to each goal they score (max +2).

### Central ramp & murderball
One shared, **bidirectional** ramp near center that either side can feed via a
small entry target. A successful entry sends the ball up a rail with real
elevation gain and a vertical **loop**, through a **player-timed accelerator
flipper** at the top, and back down onto the table.

- The accelerator is a flipper you tap as the ball arrives. Good timing → boost
  and the loop **counts**. A miss → weak return and the loop does **not** count.
- Complete **3 loops** to arm **murderball**: the next ~8 seconds the ball
  **phases through the opponent's paddle** (timed unstoppable window). The clock
  adds pressure and it can fizzle.
- Symmetric: the AI can charge and arm murderball the same way.

## Match

Timed period (e.g. 120 s). Most goals — counting multipliers — wins. Ends on a
"MATCH OVER" banner with the final score.

## Build order

1. **Table foundation (this slice):** pixel-art floor, walls, goals, ball, two
   paddles, direct-drag control, AI, timed scoring, full-screen pixelation.
2. Ramp geometry + entry target + accelerator flipper + loop counting.
3. Tug-of-war stars.
4. Murderball window + VFX.
5. Amber pixel-font scoreboard panel, SFX, PWA/offline, haptics.

## Open questions

- Exact camera tilt/height to fill portrait nicely (tune once running).
- Ramp geometry: how the bidirectional loop reads from a fixed top-down camera.
- Whether the ball needs a puck-like look or stays a sphere.
