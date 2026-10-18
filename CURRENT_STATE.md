# Current State

## Status
The Agent Surveillance MVP is implemented end to end: briefing, deterministic 210-second market surveillance, telephoto controls, ten-slot photo evidence ledger with refill, neutral photo review, spoken NAME / LIKES / CAN deduction with picture fallback, and mission report.

The HUD now includes Lily's responsive target dossier and a single MARK TARGET / TAKE PHOTO action. Students must identify Lily manually before taking photos. Wrong marks are free, and identification rescue hints name only her current route area. After identification, TARGET IN VIEW reflects framing and building visibility, independently of evidence events.

The automatic Field Notebook records only photographed, visible Lily activities, including filler activities, with one entry per activity and references to ledger photos. N or FIELD NOTEBOOK opens a paused notebook during surveillance; it is also available read-only during review and deduction. Shared evidence configuration supplies private category/strength metadata. The ledger still determines scoring, limits and refill. A version 1 JSON mission export is ready for future Agent Briefing integration.

Graphics slice A (2026-10-18) gives Lily, all 12 deterministic background NPCs and the BLOOM shopkeeper one shared rounded cartoon rig with connected elbows/knees, expressive faces, varied hair and clothes, and blended poses. Lily keeps the dossier colours and accessories; the yellow-shirt, long-hair and scooter decoys remain distinct. Walking plants feet; hands meet bike/scooter bars; riding legs follow rotating pedals; buying shows money followed by flowers; watering uses a held, tilted can and a sustained nozzle-to-soil stream. Vehicles and hand props are procedural merged geometry. Environment geometry, lighting, route sampling, event/activity IDs and mission flow are unchanged.

Lily uses 13 visible meshes normally and 20 with her bicycle/basket flowers. Matched wide-view render counts changed from 496 calls / 17,820 triangles to 443 / 72,068; Lily close-up from 121 / 4,406 to 110 / 11,886. Extra triangles provide rounded silhouettes and detail; merged assemblies reduce draw calls. The pixel-ratio cap remains 1.5. Shared photo/identity projection uses measured neutral height 2.09 and torso centre 1.24, preserving every evidence and marking threshold.

The shutter remains disabled until the revealed scene has rendered a full-opacity frame. Test-only controls remain exposed as `window.__surv` only when the URL includes `?test`.

## Run

- `npm run dev` — local development server
- `npm test` — unit tests for the ledger, route/activity coverage, target selection/visibility, notebook/export, and factual answer evaluation
- `npm run build` — production build in `dist/`
- `npm run test:e2e` — Playwright acceptance test against an existing `dist/` build; screenshots go to `.shots/`

## Known gaps

- No Agent Briefing import UI or external integration is included; `exportMission(ledger, notebook)` supplies the pure JSON-serialisable boundary.
- Graphics slice A verification passed: `npm test` (27 tests), `npm run build`, and `npm run test:e2e` using `NODE_PATH=C:/Users/nolan/recipe-tester/node_modules`. The e2e run includes identification, evidence thumbnails, notebook pause/notes, deduction and report screenshots. Matched baseline/after captures, exact camera/time setups and renderer metrics are saved in `.shots/gfx-before/` and `.shots/gfx-after/`; extra after frames cover phone, talk, walking/backpack, watering phases and pedalling. `.shots/capture-gfx.cjs` repeats the screenshot pass with SwiftShader. Browser errors: none. Final aesthetic review by Claude and Chromebook frame-rate measurement remain pending.

- Browser speech recognition and microphone permissions vary by device. Unsupported or unverified speech intentionally uses the required three-choice fallback.
- The production build emits Vite's advisory warning that the single three.js bundle exceeds 500 kB uncompressed; it builds successfully and adds no runtime dependencies.

## Test hooks

Only `?test` exposes `window.__surv`. Existing state, route, camera, shutter, finish, ledger and speech hooks remain. New hooks: `markTarget()` (deterministic cooldown bypass), `aimAtPerson(id, zoom)`, `people()` (IDs including Lily, 12 ambient NPCs and BLOOM shopkeeper), `identified()`, `notebook()` (entry snapshots), and `exportMission()` (versioned JSON data). `shoot()` always rejects before identification. `state().paused` and `state().time` expose notebook pause behavior.
