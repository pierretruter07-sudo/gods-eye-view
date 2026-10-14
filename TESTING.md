# Testing

## Gates (run in this order; CI runs the same on Node 24.14 and 26)

| Command | What it checks |
|---|---|
| `npm run doctor -- --json` | Node version, dependencies, which keys are configured (values never printed) |
| `npm run format:check` | Prettier formatting of the adopted scope (`scripts/format-scope.json`, `src/`, `server/`) |
| `npm run check:boundaries` | Import directions (sources never import rendering; browser code never reaches Node or server code) and package export boundaries |
| `npm test` | All `src/**/*.test.mjs` unit and integration tests (Node test runner). Allocation micro-benchmarks run serialised with `--expose-gc` on Node 24.14 only. |
| `npm run build` | Production bundle |
| `node scripts/audit/import-graph.mjs` | Orphan-code and dangling-import report (must be 0 / 0) |

## Smoke test (before every deploy)

1. `npm run build && npx vite preview --port 23999`
2. Load `http://localhost:23999/?nointro` in headless Chromium for 25 s.
3. Pass when there are 0 page errors, all nine layer ids are registered in
   `window.__godsEyeView.dataManager`, and `window.__godsEyeView.build`
   shows the expected commit.

Console network errors from rate-limited free providers (for example HTTP
429 from the terrain host) are recorded but do not fail the smoke test.

## Where tests live

| Area | Tests |
|---|---|
| Director | `src/tour/events.test.mjs`, `src/tour/planner.test.mjs` |
| Intel HUD and actions | `src/intel/*.test.mjs` (including HTML-injection tests in `markup.test.mjs`) |
| Shell policies | `src/shell/shellPolicies.test.mjs` |
| Exercise mode | `src/exercise/package.test.mjs` |
| Server proxies and build | `src/tooling/*.test.mjs` |
| Layers and shared models | `src/layers/**`, `src/data/**` |

## Writing tests

- Put pure decision logic in a `*Policy.js` or model module so it can be
  tested without Cesium or a DOM.
- Every new requirement in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) needs
  a test (or a stated inspection or demonstration method), plus a row in
  [docs/VERIFICATION.md](docs/VERIFICATION.md).
- Record each baseline run in the results log in `docs/VERIFICATION.md §4`.
