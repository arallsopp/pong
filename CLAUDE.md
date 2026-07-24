# Murderball — working notes

A mobile-first PWA game: top-down **air-hockey + pinball** hybrid in a 16-bit
Bitmap-Brothers pixel style. Solo vs AI. Built with **Three.js + Vite +
TypeScript**. See `DESIGN.md` for the full design rationale and decisions.

> Note: the repo/URL is called `pong` and it began as a first-person 3D Pong
> (now abandoned — still in git history). The current game is Murderball.

## Run / verify / deploy

```bash
npm run dev -- --host     # http://localhost:5173/pong/  (LAN IP for phone)
npx tsc --noEmit          # type-check (do this after every change)
npm run build             # production build (tsc + vite)
```

- **Base path is `/pong/`** (`vite.config.ts`) for GitHub Pages — dev URL
  includes it.
- **Deploy:** pushing to `main` triggers `.github/workflows/deploy.yml` →
  GitHub Pages at **https://arallsopp.github.io/pong/**.
- **Pushing:** the git remote is SSH but this environment has no SSH key. Push
  over HTTPS with the gh credential helper:
  `gh auth setup-git && git push https://github.com/arallsopp/pong.git HEAD:main`.
  The user also commits/pushes intermittently themselves — run `git log`/`git
  status` before assuming what's committed.

## Coordinate system (important)

Everything lives on the **XZ plane**, y = up.

- `x` = width, `[-HALF_W, HALF_W]` = `[-10, 10]`.
- `z` = length, `[-HALF_L, HALF_L]` = `[-16, 16]`.
- **`+z` = near / OUR end** (bottom of screen, our goal, blue paddle).
- **`-z` = far / THEIR end** (top, AI, grey/orange paddle).
- `y` is only non-trivial while the ball rides the ramp.

Camera is a **fixed 3D perspective** view (table reads as a trapezoid), at
`(0, CAM_Y=30, CAM_Z=26)` looking at `(0,1,-2)` — see `main.ts`.

## Rendering approach

Full-resolution render. The 16-bit look comes from **nearest-filtered bitmap
textures on smooth geometry** + a chrome **matcap** for metal (ball, paddles,
rails). We tried full-screen low-res pixelation and **deliberately abandoned
it** (it made the round ball blocky). Don't reintroduce it without asking.

## File map (`src/`)

| File | Responsibility |
|---|---|
| `main.ts` | Entry: scene, renderer, fixed **120 Hz** loop, camera, ball+paddles, touch-drag input (raycast to table plane), ramp traversal, possession, power-ups, AI, goal-replay sequence, HUD/overlays. |
| `game/const.ts` | All dimensions and tunable gameplay constants, the `SLOTS` geometry (see below), and the `AI_PROFILES` difficulty table. |
| `game/physics.ts` | 2D ball physics. `stepBall(ball, dt, paddles, sealed)` → `{goal, hitIndex, wall, phasedIndex}`; walls leave goal mouths open unless `sealed`; paddle = elastic circle-circle that transfers paddle velocity; guard blades are capsule colliders. |
| `game/table.ts` | Floor plane + side walls (two runs each, chamfered around the slot, plus the guard blade) + end walls. Each slot mouth's 45° chamfer is plain wall steel; the owner's colour is a **lip on the wall top** at the mouth (`addMouthCap`) so it reads from the near-top-down camera. `WALL_H=3.5`. |
| `game/floorTexture.ts` | Procedural pixel-art floor: metal-blue, rivets, **embossed** center circle + line, lavender star, amber goal mouths. Drawn at 3× res. **Owns the shared plate palette + rivet grid** (`PLATE_*`, `RIVET_PX`, `rivet()`) that the walls reuse. |
| `game/textures.ts` | Metal matcap, steel wall panel (`makeSteelTexture(lenUnits, offsetUnits)` — exact-fit, no tiling, rivets phase-locked to world position), ball shadow texture. (`makePaddleTexture` is currently unused.) |
| `game/ramp.ts` | Murderball rail: corkscrew up outside the **right** wall → **over-the-top arch** → mirrored corkscrew down into the **left** wall. `ride(u)` runs right mouth (u=0) → left mouth (u=1). Point-symmetric; smooth by construction. Slot portals coloured per owner, plus the projected **rail shadow**. |
| `game/stars.ts` | Claim **targets** (`buildTargets`): 4 sockets, two evenly spaced either side of each wall slot. Black until hit; the last hitter lights one their colour (blue=us/pink=them), stealable. `countFor(owner)` = that side's multiplier on the next goal; `reset()` after a goal. |
| `game/guns.ts` | Power-up token (pixel icon per effect) + bolt mesh factories; `Power` = `freeze \| shrink \| slow \| shield`. |

## What works now

- Air-hockey rally vs a beatable AI; **timed match** (120 s) with `MATCH OVER`.
- **Start overlay** with an Easy/Normal/Hard picker (see `AI_PROFILES`) and an
  **AI power-ups On/Off** toggle (whether the AI collects tokens — independent of
  difficulty, default On, drives `aiGunsEnabled`/`aiToken()`); a **restart**
  button beside mute reopens it. Match over → banner for 2.5 s → overlay again
  with the result and PLAY AGAIN.
- Direct **touch-drag** paddle, confined to our half; imparts velocity to ball.
  Each paddle wears its team band (blue = us, pink = them).
- **Claim targets**: last hitter lights the target it presses against; your lit
  count is your goal multiplier (up to ×5), then all reset on any goal. Stealable.
- **Murderball ramp**: enter your wall slot (see the slot geometry below); ride
  up-over-down; exit boosted at the far slot and **off the opponent goal** (needs
  a bounce back before you can score). Entering **arms your murderball** (by slot
  ownership, not possession) — ball glows your colour, phases through and
  **shatters** the opponent paddle for ~8 s or until a goal.
- **Power-ups**: one token at a time across the centre line, badged with its
  effect, grabbable by **either** paddle. `freeze` / `shrink` / `slow` fly at the
  opponent as a homing bolt and only land if it connects; `shield` seals your own
  goal at once. All 6 s; a new debuff replaces the running one. **A murderball
  goes through a shield.**
- **AI behaviour**: races for tokens when the ball is heading away (gated by the
  AI power-ups toggle, not difficulty); otherwise intercepts incoming balls or
  falls back to a central home post. Difficulty (`AI_PROFILES`) is now just top
  speed, aim error, and pace. The AI **no longer seeks the ramp** — it used to
  line up behind the ball and dribble it into its own slot, which let it stick
  the ball to its paddle and walk it to the ramp.
- **Overlays**: live multiplier + murderball tags under the score; a big
  translucent neon punch-in at centre whenever either changes.
- **Goal replay**: 2 s of tape played back at 0.5×, camera dropping out of the
  play view to chase the ball through the mouth, then a cut to the wide shot, the
  intro zoom back down, a 0.5 s beat, and the serve. **Match clock paused
  throughout.** When **you concede** (the near goal), the chase also **orbits the
  view around the ball** (`PLAYER_GOAL_SPIN`, default 180°) so the board spins
  back to a readable orientation instead of cutting to a mirrored view.
- **Scoreboard** shows each side's score in its **home colour** (blue = us, pink
  = them); the clock stays amber.
- **Persistence** (localStorage key `murderball`, `loadPrefs`/`savePrefs` in
  `main.ts`): remembers difficulty, the AI power-ups toggle, mute, and the **high
  score** (best goals scored in a match). Restored into the overlay controls by
  `applyPrefsToUI()` on load; the overlay shows `BEST nnn`. Wrapped in try/catch
  so private-mode/blocked storage just falls back to defaults.
- Opening **corners-fit zoom** (1 s) into a viewport that keeps all four table
  corners in view; gentle rally-lower; corner anti-trap. Altitude-aware shadows,
  including a **projected rail shadow** that fades at the table edge.

## Not done yet (rough build order)

1. **On-device framing check**: the ramp arch rises above the walls and bulges
   past them, so its top can clip the screen edge at max zoom (the fit tracks only
   the four floor corners). Decide whether to fold the arch into the fit.
2. **Presentation/PWA**: amber pixel-font scoreboard panel (HUD is CSS
   monospace now), SFX for the new power-ups, haptics, offline service worker +
   manifest/install, portrait lock, wake lock.

## Working style & gotchas

- **We build blind** — the assistant can't see the running game; the user
  eyeballs it and reports back. So: keep shape/feel constants at the **top of
  each module** and easy to tune, and expect a few iterations per visual change.
- **Layout reference:** `docs/court-plan.svg` is a to-scale top-down plan
  (walls, goals, ramp loops, slots, guard blades, targets, paddles) for
  discussing geometry. Regenerate from the current constants with `node
  docs/court-plan.js docs/court-plan.svg` after changing dimensions (it's an ESM
  script, mirrors `makeSlot()` from `const.ts`).
- **Slot geometry** lives in `const.ts`: `SLOTS[0]` = right/ours, `SLOTS[1]` =
  left/theirs, both at mid-court. Each carries its axis `a` (out of court = the
  required entry direction), cross-normal `n`, the wall-face `z` where each jaw
  sits, and the guard-blade capsule `fin`. `table.ts`, `ramp.ts`, `stars.ts`,
  `physics.ts` and the plan generator all derive from `SLOTS` — change slot shape
  there and everything follows.
- The **ramp** is a corkscrew up outside the right wall → over-the-top arch →
  mirrored corkscrew into the left wall, tuned by the shape constants at the top
  of `ramp.ts` (`R`, `LOOP_TURNS`, `CROSS_Y`, `PEAK_Y`, `RIDE_LIFT`, etc.). Plain
  point-symmetric Catmull-Rom — smooth, no kinks.
- Ramp ownership is by **which slot the ball enters** (not last hitter). Entry
  requires the ball travelling roughly along the slot axis (`RAMP_AIM_DOT` dot in
  `tryEnterRamp`); the **guard blade** turns most wrong-way balls away before they
  reach the throat. Exit aim/off-target is `RAMP_MISS` in `const.ts`.
- Team colours `COLOR_ME` / `COLOR_THEM` live in `const.ts` (murderball glow,
  portals, targets, slot-mouth lips, and the scoreboard scores all share them).
- **Camera-angle gotcha:** the play camera is near-top-down, so a *vertical*
  coloured face (like the old slot chamfer paint) is seen edge-on and clips to a
  useless sliver. Mark things the player must read on **horizontal top surfaces**
  (wall caps/lips) instead — that's why the slot colour moved to a wall-top lip.
- Paddle identity is by **position** (bottom = us) not loud color — palette is
  muted metal blue-grey to match the aesthetic.


