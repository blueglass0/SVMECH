# Steel Vulture — notes for Claude Code

Top-down real-time mech game. Full design and milestone plan: `docs/PLAN.md`. Read it first.

## Current milestone

**Milestone 1 — Foundation: built, awaiting the user's sign-off.**
Do not start milestone 2 (Movement feel) until the user signs off M1.

## Decisions made after the plan

- **Phones are landscape-only.** In portrait, show a "rotate your device" prompt (build in M2).

## Stack

- TypeScript (strict), Phaser 4, Vite 8. `npm run dev` (dev server, debug overlay on),
  `npm run build` (type-check + production build), `npm run preview`.
- Deploy: `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
  Pages source must be set to "GitHub Actions" in the repo settings. If it is "Deploy from a branch",
  Pages serves the raw source and the game never loads.
- Saves (from M5) go in `localStorage`.

## Layout

- `src/main.ts` — game config and boot.
- `src/config/` — engine and display settings (render budget, view size).
- `src/data/` — game content and balance numbers (mechs, weapons, economy, maps). No logic.
- `src/core/` — shared systems (viewport sizing, debug flag; later input layer, pools, save).
- `src/scenes/` — Phaser scenes. `Boot` → `Map` (world) + `Hud` (screen-space UI, laid out in CSS px).

## Working rules (from the plan)

- **Data-driven content.** Mechs, weapons, equipment, enemies, factions and every economy number
  live in `src/data/`, separate from logic, so balancing is editing numbers.
- **One input layer.** Game code reads abstract actions (move, aim, fire group 1/2, equipment,
  interact). Keyboard+mouse and touch are sources feeding it; nothing else reads keys or touches.
- **Ship every milestone.** Each ends deployed to Pages with a short "what to test" note. The next
  milestone starts only after sign-off. Leave room for later systems but don't build them early.
- **Dev tools.** Debug overlay (fps, renderer, resolution; later hit arcs) shows in dev or with
  `?debug` in the URL. Dev menu (money, spawn enemies, skip mission) arrives with the systems it needs.
- **Update this file** when a milestone changes state.

## Performance rules (the game must run on most hardware, including low-end PCs and phones)

- Target smooth 60 fps on a mid-range phone and on integrated laptop graphics.
- Render budget lives in `src/config/display.ts`: device pixel ratio capped at 2, canvas capped at
  ~1080p worth of pixels; bigger screens render lower and stretch. Don't bypass it.
- `Phaser.AUTO`: WebGL with Canvas 2D fallback. Keep everything working in Canvas mode
  (avoid WebGL-only filters/shaders for anything gameplay-critical).
- Pool bullets, effects and enemies; never create/destroy per shot. Cap particles.
- Bake static vector art into textures once (in `Boot`) instead of redrawing Graphics every frame.
  Static Graphics are fine for a few hundred simple shapes; per-frame `clear()`+redraw is not.
- Text re-renders a texture on every `setText`: update HUD text only when the value changes,
  and throttle fast-changing readouts.
- All movement and timers use frame `delta`, never per-frame constants, so the game behaves the
  same at 30, 60 or 144 fps.
- Keep the bundle lean: no heavy dependencies without a reason. Phaser is split into its own
  cached chunk.

## Conventions

- Units: world units are pixels at zoom 1; angles in radians internally; time in ms from Phaser,
  convert to seconds for physics.
- Colours as `0xRRGGBB` numbers in data/config files.
- Don't put model or tool identifiers in commits or code.
