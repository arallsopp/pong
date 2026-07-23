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
| `main.ts` | Entry: scene, renderer, fixed **120 Hz** loop, camera, ball+paddles, touch-drag input (raycast to table plane), ramp traversal, tug-of-war/possession, guns, HUD. |
| `game/const.ts` | All dimensions and tunable gameplay constants. |
| `game/physics.ts` | 2D ball physics. `stepBall()` → `{goal, hitIndex}`; walls leave goal mouths open; paddle = elastic circle-circle that transfers paddle velocity. |
| `game/table.ts` | Floor plane + side/end walls (tall, `WALL_H=3.5`). |
| `game/floorTexture.ts` | Procedural pixel-art floor: metal-blue, rivets, **embossed** center circle + line, lavender star, amber goal mouths. Drawn at 3× res. |
| `game/textures.ts` | Metal matcap, steel wall texture, ball shadow texture. (`makePaddleTexture` is currently unused.) |
| `game/ramp.ts` | Murderball rail: an **over-the-top arch** from a hole in the **right** wall (ours) to a hole in the **left** wall (theirs), apex over centre. Single tube, ball rides on top. `ride(u)` runs right mouth (u=0) → left mouth (u=1). Point-symmetric; smooth by construction. Wall-mouth portals coloured per owner. |
| `game/stars.ts` | Claim **targets** (`buildTargets`): 4 sockets, two flanking each wall mouth. Black until hit; the last hitter lights one their colour (blue=us/pink=them), stealable. `countFor(owner)` = that side's multiplier on the next goal; `reset()` after a goal. |
| `game/guns.ts` | Gun pickup token (pixel icon) + laser-shot mesh factories. |

## What works now

- Air-hockey rally vs a beatable AI; **timed match** (120 s) with `MATCH OVER`.
- Direct **touch-drag** paddle, confined to our half; imparts velocity to ball.
- **Claim targets**: last hitter lights the target it presses against; your lit
  count is your goal multiplier, then all reset on any goal. Stealable.
- **Murderball ramp**: enter your wall mouth (must be moving away from your own
  end); ride up-over-down; exit boosted and **just off the opponent goal** (needs
  a bounce back before you can score). Entering **arms your murderball** (by mouth
  ownership, not possession) — ball glows your colour, phases through and
  **shatters** the opponent paddle for ~8 s or until a goal.
- **Gun**: token spawns in our half; touch it with the paddle to grab it (token
  vanishes at once) and auto-fire a homing bolt that freezes the AI 3 s.
- Opening **corners-fit zoom** (1 s) into a viewport that keeps all four table
  corners in view; gentle rally-lower; corner anti-trap. Altitude-aware shadows.

## Not done yet (rough build order)

1. **AI symmetry**: the AI never grabs guns or feeds its own (left) ramp mouth to
   charge murderball. Guns spawn only in our half. Murderball is reachable by both
   sides mechanically but the AI won't set it up.
2. **On-device framing check**: the ramp arch rises above the walls and bulges
   past them, so its top can clip the screen edge at max zoom (the fit tracks only
   the four floor corners). Decide whether to fold the arch into the fit.
3. **Presentation/PWA**: amber pixel-font scoreboard panel (HUD is CSS
   monospace now), SFX, haptics, offline service worker + manifest/install,
   portrait lock, wake lock.

## Working style & gotchas

- **We build blind** — the assistant can't see the running game; the user
  eyeballs it and reports back. So: keep shape/feel constants at the **top of
  each module** and easy to tune, and expect a few iterations per visual change.
- The **ramp is an over-the-top arch** between two wall holes (right=ours,
  left=theirs), tuned by the shape constants at the top of `ramp.ts` (`OUT_BULGE`,
  `CURL_Y`, `PEAK_Y`, `RIDE_LIFT`, etc.). It's a plain Catmull-Rom through 7
  point-symmetric control points — smooth, no banking, no spiral kinks.
- Ramp ownership is by **which mouth the ball enters** (not last hitter). Entry
  requires the ball moving **away from the owner's end** (`ball.vz` gate in
  `tryEnterRamp`). Exit aim/off-target is `RAMP_MISS` in `const.ts`.
- Team colours `COLOR_ME` / `COLOR_THEM` live in `const.ts` (murderball glow,
  portals, targets all share them).
- Paddle identity is by **position** (bottom = us) not loud color — palette is
  muted metal blue-grey to match the aesthetic.
