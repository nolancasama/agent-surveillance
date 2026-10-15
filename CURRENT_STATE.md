# Current State

## Status
The Agent Surveillance MVP is implemented end to end: briefing, deterministic 210-second market surveillance, telephoto controls, ten-slot photo evidence ledger with refill, neutral photo review, spoken NAME / LIKES / CAN deduction with picture fallback, and mission report.

The procedural scene contains Lily, 12 deterministic background NPCs, a separate BLOOM shopkeeper, the three required decoys, all market landmarks, and visible flower, watering, bike, and scooter staging. Long-haired characters have readable forward-facing features, watering uses a larger bright can and sustained visible stream, the bike lap stays on open paving, and an extended ground plus instanced skyline closes the wide-view horizon. The shutter remains disabled until the revealed scene has rendered a full-opacity frame. Test-only controls are exposed as `window.__surv` only when the URL includes `?test`.

## Run

- `npm run dev` — local development server
- `npm test` — unit tests for the ledger, route, and factual answer evaluation
- `npm run build` — production build in `dist/`
- `npm run test:e2e` — Playwright acceptance test against an existing `dist/` build; screenshots go to `.shots/`

## Known gaps

- Browser speech recognition and microphone permissions vary by device. Unsupported or unverified speech intentionally uses the required three-choice fallback.
- The production build emits Vite's advisory warning that the single three.js bundle exceeds 500 kB uncompressed; it builds successfully and adds no runtime dependencies.
