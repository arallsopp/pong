# Murderball — Design Spec

A mobile-first PWA. Top-down air-hockey with pinball mechanics, in a 16-bit
Bitmap-Brothers visual style. You defend the bottom goal against an AI at the
top. Score into their goal; most goals when the clock runs out wins.

> Supersedes the earlier first-person 3D Pong (still in git history / deployed).
> This is a fresh build; only the fixed-timestep loop and reflection math carry
> over.

## View & render

- **3D scene, fixed perspective camera** (table reads as a trapezoid). Portrait.
  Our goal near/bottom (+z), theirs far/top (-z).
- **16-bit look via bitmap textures, not pixelation.** Full-resolution render;
  NearestFilter bitmap textures on smooth geometry + a chrome matcap for metal.
  (Full-screen low-res pixelation was tried and abandoned — it made the round
  ball blocky.)

## Art direction

Reference: Bitmap Brothers / Speedball 2.
- **Floor:** metal blue, rivet dot-grid, a large lavender 5-point star, an
  embossed center line + face-off circle, amber goal mouths.
- **HUD:** amber pixel font on a steel panel ("MATCH OVER / SCORE 010 TO 022").
  (Currently CSS monospace; real pixel-font panel is a TODO.)
- **Paddles:** short metal blue-grey cylinders. Identity is by position (bottom
  = us), not loud team colors.

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
A shared, **bidirectional** rail near center. Its shape (from the user's
top-down drawing) is an **open S-curve with a ~1-turn spiral at each end**; the
spirals bulge **out past the side walls**, and the two free inner tips (near
center) are the entry/exit mouths. It's lifted into 3D — low at the tips, up
onto a plateau (clearing the walls), peaking over the table center — so the ball
goes up and over. Built as **two banked rods a fixed distance apart** with the
ball riding **on top** like a marble; corners bank for (fake) centripetal hold.

- Entry only fires when the ball approaches a tip **roughly parallel** to the
  rails (else it passes through the mouth).
- Planned: a **player-timed accelerator flipper** at the apex. Good timing →
  boost + the loop **counts**; a miss → weak return, loop doesn't count.
- Planned: complete **3 loops** to arm **murderball** → **~8 s unstoppable
  window** (ball phases through the opponent's paddle).
- Intended symmetric: the AI can charge murderball the same way.

### Gun pickup (added mechanic)
Gun tokens appear randomly. **Cover a gun with your paddle, then lift your
finger to fire** a bolt up-court; it **freezes the opponent's paddle for 3 s**
(a sitting duck to score on). Intended symmetric for the AI later.

## Match

Timed period (120 s). Most goals — counting multipliers — wins. Ends on a
"MATCH OVER" banner with the final score.

## Implementation status

See `CLAUDE.md` for the authoritative, current "what works / what's stubbed"
list and the file map. In brief: table + air-hockey + timed scoring + tug-of-war
stars + ramp geometry & ride + gun mechanic are in; the accelerator flipper,
loop-counting → murderball window, AI symmetry, and presentation/PWA polish are
not yet built. The ramp currently just auto-boosts on exit.

## Resolved since first draft

- Camera: fixed **3D perspective** (not top-down) — the table reads as a
  trapezoid so the ramp loops rise off it.
- Rendering: full-res with nearest-filtered bitmap textures + chrome matcap;
  full-screen pixelation was tried and **abandoned**.
- Ball: stays a round chrome **sphere** (matcap), with an altitude-aware shadow.
