# Steel Vulture — notes for Claude Code

Top-down real-time mech game. Full design and milestone plan: `docs/PLAN.md`. Read it first.

## Current milestone

**Milestone 5 — Economy loop: built, awaiting the user's playtest and sign-off.** M1–M4 signed off.
This completes the prototype (M1–M5). Do not start milestone 6 until the user signs off M5.
Tuning loop: the user tunes with the `?debug` Tune panel and pastes values back into `src/data/`.

## Decisions made after the plan

- **Phones are landscape-only.** Portrait shows a "rotate your phone" prompt and pauses the game.
- **Throttle is hold-to-move** (release W/S or the stick and the mech coasts to a stop), not a
  persistent MechWarrior-style throttle setting. Chosen because it maps onto the phone stick.
- **Phones see slightly less of the map** (640 vs 720 world units on the short side) so the mech
  isn't tiny. PC view size is approved as is.
- **Chassis feel:** heavier chassis get lower turn rates and more momentum (lower accel/decel),
  lights turn and accelerate quicker. The movement numbers in `chassis.ts` are enough to make
  chassis feel distinct (user-approved, M2).

## Stack

- TypeScript (strict), Phaser 4, Vite 8. `npm run dev` (dev server, debug overlay on),
  `npm run build` (type-check + production build), `npm run preview`.
- Deploy: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
  Pages source must be set to "GitHub Actions" in the repo settings. If it is "Deploy from a branch",
  Pages serves the raw source and the game never loads.
- Saves go in `localStorage` (`steel-vulture.career.v1`, see `src/career/career.ts`).
- `?quick` skips the career and starts a throwaway mission (dev); `?debug` shows the dev tools.

## Layout

- `src/main.ts` — game config and boot.
- `src/config/` — engine and display settings (render budget, view size).
- `src/data/` — game content and balance numbers (mechs, weapons, economy, maps). No logic.
- `src/core/` — shared engine-level systems: viewport sizing, input layer (`core/input/`),
  collision (`CollisionWorld`: grid-bucketed obstacles, push-out, raycasts), seeded RNG,
  synthesized audio (`audio.ts`, Web Audio, no files), settings (localStorage), math, debug flag.
- `src/game/` — gameplay. Logic and rendering are split where it matters: `MechMotor` (pure
  movement logic, no Phaser) and `MechView` (sprites). `art.ts` bakes all vector art at boot.
  - `units/` — `PlayerMech` (weapons, heat, ammo, armor) and `Enemies` (tank, turret, structure + AI).
  - `combat/` — `Combat` (pooled projectiles and beams, hit tests), `Effects` (pooled sparks,
    explosions, smoke, scorch), `types.ts` (`Unit`: anything shots can hit).
  - `world/` — `mapgen.ts` (seeded procedural maps), `NavGrid.ts` (A* for tanks).
  - `hudState.ts` — plain data the map scene publishes and the HUD reads.
- `src/scenes/` — Phaser scenes. `Boot` (bakes art) → `Map` (world) + `Hud` (screen-space UI, laid out in CSS px).
- `src/career/` — career rules and state (`career.ts`: money, upkeep, contracts, shop, loadout
  limits, loans, career over, save/load; `types.ts`). Pure logic, no DOM or Phaser.
- `src/ui/` — HTML/DOM UI over the canvas: `app.ts` (title, hangar tabs, deploy, debrief,
  career over, pause/withdraw; owns the career and starts missions), `dom.ts` (toolbar, tuning
  panel), `h.ts` (tiny DOM builder), `ui.css`. Menus belong in the DOM, not in Phaser: crisp,
  cheap, and touches on them never reach the sticks.
- Flow: `Boot` bakes art and emits `booted` → `App` shows title/hangar → deploy starts `Map` +
  `Hud` with a `MissionConfig` → `Map` emits `mission-end` with a `MissionOutcome` → `App`
  stops the scenes (deferred one tick) and shows the debrief.

## Working rules (from the plan)

- **Data-driven content.** Mechs, weapons, equipment, enemies, factions and every economy number
  live in `src/data/`, separate from logic, so balancing is editing numbers.
- **One input layer.** Game code reads abstract actions (move, aim, fire group 1/2, equipment,
  interact) from `actions` in `src/core/input/`. Keyboard+mouse and touch are sources feeding it;
  nothing else reads keys or touches. `actions.device` is the last-used device and picks the
  control scheme (tank/direction, per device, stored in settings) and whether touch sticks show.
- **Ship every milestone.** Each ends deployed to Pages with a short "what to test" note. The next
  milestone starts only after sign-off. Leave room for later systems but don't build them early.
- **Dev tools.** Debug overlay (fps, worst frame, renderer, resolution, map seed; later hit arcs)
  shows in dev or with `?debug` in the URL. The Tune panel (debug only) has movement sliders and
  dev buttons: win mission, spawn tank, invulnerable, repair + refill, hit a section, new map.
  Add money etc. with M5.
  `?seed=N` replays a specific map; the end screen shows each map's seed.
- **Update this file** when a milestone changes state.

## Performance rules (the game must run on most hardware, including low-end PCs and phones)

- Target smooth 60 fps on a mid-range phone and on integrated laptop graphics.
- Render budget lives in `src/config/display.ts`: device pixel ratio capped at 2, canvas capped at
  ~1080p worth of pixels; bigger screens render lower and stretch. Don't bypass it.
- `Phaser.AUTO`: WebGL with Canvas 2D fallback. Keep everything working in Canvas mode
  (avoid WebGL-only filters/shaders for anything gameplay-critical).
- Pool bullets, effects and enemies; never create/destroy per shot. Cap particles. Pools are
  fixed-size (shots 240, beams 8, sparks 64...); effect pools are round-robin (oldest reused).
- No tint: Canvas mode doesn't support it. Colour variants are separate baked textures
  (e.g. `px-*` swatches for bars, `*-wreck` textures for destroyed units).
- Obstacles are drawn once into per-chunk Graphics (800×800 world units); off-screen chunks are
  hidden each frame. Measured M3 game logic: ~0.1–0.25 ms/frame with 16 enemies and full fire.
- Bake static vector art into textures once (in `Boot`) instead of redrawing Graphics every frame.
  Static Graphics are fine for a few hundred simple shapes; per-frame `clear()`+redraw is not.
- Text re-renders a texture on every `setText`: update HUD text only when the value changes,
  and throttle fast-changing readouts.
- All movement and timers use frame `delta`, never per-frame constants, so the game behaves the
  same at 30, 60 or 144 fps. Phaser's `fps.smoothStep` is off on purpose: it clamps delta to
  1/60 s when the window is unfocused, which slows the whole game down. Scenes clamp dt to 100 ms.
- Keep the bundle lean: no heavy dependencies without a reason. Phaser is split into its own
  cached chunk.

## Gameplay notes (M3)

- Map generation keeps every obstacle `minGap` (100) from every other obstacle and the map edge,
  so all open ground is connected; validated over 300 seeds (all targets and tanks reachable).
- Weapons fire along the torso facing from their hardpoint position (no convergence on the
  cursor), so the slow torso matters. Laser is hitscan; ballistics are projectiles.
- Phone aim assist: stick aim bends halfway toward an enemy within 12° and 650 units.
- Phone weapon groups: right stick fires `actions.stickGroup`; the ⇄ button next to it toggles 1/2.
  Right stick aims only inside the inner ring (`CONTROLS.fireThreshold`) and fires past it.
- Planned additions (see `docs/PLAN.md`): fog of war + sensors with M6, destructible terrain
  as M6b, continuous-beam lasers with M8.
- Enemies alert neighbours within 650 units when shot. Tanks path with A* (repath ~1.5 s).
- Locational damage (M4): `SectionDamage` (pure logic, reusable for enemy mechs in M8) with
  rules in `src/data/damage.ts`. The point where a shot strikes the mech's outline, as an angle
  from the torso facing, picks the section: front ±25° torso, sides (incl. off-centre frontal
  hits) that arm, rear ±40° torso ×1.5. Legs take 15% of every hit plus splash: enemy cannon
  shells burst on the ground at their aim point if they miss (`WeaponDef.splash`), and splash
  hits mechs in the legs. Measured: ~28/25/32/15% torso/arms/legs standing still against
  frontal fire; legs ~35% when walking (near misses). Damage beyond
  an arm's armor (or to a missing arm) goes to the torso; torso at 0 = mech destroyed.
  Destroyed arm: its weapons stop, arm sprite becomes a stump. Leg damage below 60% slows
  speed/turning, down to 35%/55% when destroyed. Sections under 40% smoke.
- HUD: silhouette (per-section condition colours, flashes white when hit) and red hit-direction
  arcs around the mech for every hit (helps with shots from off-screen; fog of war will need it).
  Debug mode draws the hit arcs around the mech.

## Economy notes (M5)

- All numbers in `src/data/economy.ts` (× economy difficulty). Chassis price/tonnage/power in
  `chassis.ts`, weapon price/tonnage/power in `weapons.ts`.
- Fuel is per ton per deployment; ammo is paid for what you top up (leftover ammo stays loaded);
  repairs per armor point (destroyed sections ×1.5); rebuild = 35% of chassis + weapons.
- Damage carries between missions until repaired; you may deploy damaged.
- Loan installments are due after every mission; shortfalls auto-sell spare gear, then end the
  career (easy economy: bailout instead). Career also ends when the mech is destroyed or you
  can't afford fuel, selling spares can't cover it, and you already have a loan.
- Reloading mid-mission counts as a withdrawal (`activeContract` in the save).
- Bonus objectives: destroy all turrets / all tanks / finish within a time / lose no section.

## Conventions

- Units: world units are pixels at zoom 1; angles in radians internally (data files use degrees
  for readability); time in ms from Phaser, convert to seconds for physics.
- Angle 0 = facing right (+x); positive is clockwise on screen. Mech art faces right.
- Target browsers: ES2020 (iOS 14+ Safari). Avoid newer APIs like `structuredClone` without a fallback.
- Colours as `0xRRGGBB` numbers in data/config files.
- Don't put model or tool identifiers in commits or code.
