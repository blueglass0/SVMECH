# Steel Vulture

Top-down, real-time mech game for the browser (PC and phone). Working title.

- Design and build plan: [`docs/PLAN.md`](docs/PLAN.md)
- Project conventions: [`CLAUDE.md`](CLAUDE.md)

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173 (also on your LAN, for phone testing)
npm run build    # production build into dist/
```

Add `?debug` to any URL to show the debug overlay (fps, renderer, resolution).

## Deploy

Every push to `main` builds and deploys to GitHub Pages via GitHub Actions.
One-time setup: repo **Settings → Pages → Source: GitHub Actions**.
