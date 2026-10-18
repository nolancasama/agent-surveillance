# Current State

## Status
The Agent Surveillance MVP is implemented end to end: briefing, deterministic 210-second market surveillance, telephoto controls, ten-slot photo evidence ledger with refill, neutral photo review, spoken NAME / LIKES / CAN deduction with picture fallback, and mission report.

The HUD now includes Lily's responsive target dossier and a single MARK TARGET / TAKE PHOTO action. Students must identify Lily manually before taking photos. Wrong marks are free, and identification rescue hints name only her current route area. After identification, TARGET IN VIEW reflects framing and building visibility, independently of evidence events.

The automatic Field Notebook records only photographed, visible Lily activities, including filler activities, with one entry per activity and references to ledger photos. N or FIELD NOTEBOOK opens a paused notebook during surveillance; it is also available read-only during review and deduction. Shared evidence configuration supplies private category/strength metadata. The ledger still determines scoring, limits and refill. A version 1 JSON mission export is ready for future Agent Briefing integration.

The procedural scene contains Lily, 12 deterministic background NPCs, a separate BLOOM shopkeeper, the three required decoys, all market landmarks, and visible flower, watering, bike, and scooter staging. Long-haired characters have readable forward-facing features, watering uses a larger bright can and sustained visible stream, the bike lap stays on open paving, and an extended ground plus instanced skyline closes the wide-view horizon. The shutter remains disabled until the revealed scene has rendered a full-opacity frame. Test-only controls are exposed as `window.__surv` only when the URL includes `?test`.

## Run

- `npm run dev` — local development server
- `npm test` — unit tests for the ledger, route/activity coverage, target selection/visibility, notebook/export, and factual answer evaluation
- `npm run build` — production build in `dist/`
- `npm run test:e2e` — Playwright acceptance test against an existing `dist/` build; screenshots go to `.shots/`

## Known gaps

- No Agent Briefing import UI or external integration is included; `exportMission(ledger, notebook)` supplies the pure JSON-serialisable boundary.
- The E2E script includes identification, notebook pause/notes and screenshot captures (`dossier-panel.png`, `mark-confirmation.png`, `note-toast.png`, `field-notebook.png`). It was updated for this change but not executed under this order's validation scope; new browser screenshots and final aesthetic review remain pending.

- Browser speech recognition and microphone permissions vary by device. Unsupported or unverified speech intentionally uses the required three-choice fallback.
- The production build emits Vite's advisory warning that the single three.js bundle exceeds 500 kB uncompressed; it builds successfully and adds no runtime dependencies.

## Test hooks

Only `?test` exposes `window.__surv`. Existing state, route, camera, shutter, finish, ledger and speech hooks remain. New hooks: `markTarget()` (deterministic cooldown bypass), `aimAtPerson(id, zoom)`, `people()` (IDs including Lily, 12 ambient NPCs and BLOOM shopkeeper), `identified()`, `notebook()` (entry snapshots), and `exportMission()` (versioned JSON data). `shoot()` always rejects before identification. `state().paused` and `state().time` expose notebook pause behavior.
