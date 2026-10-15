# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-09-25 — Surveillance MVP as a separate program
- Built as a new sibling project rather than a mode inside `agent-briefing`; shared modules (data, evaluate, recorder, sfx) are copied into `src/shared/` with only an ES export added. Why: the user asked for a brand-new program, and Agent Briefing is a no-build classic-script app while this needs three.js + Vite. Rejected: importing across `../agent-briefing` (breaks standalone builds).
- Mark is Lily (likes flowers, can ride a bike), not Ben: swimming cannot be staged in a market square; a bike is the most readable CAN at range, and pushing a bike is a natural weak-evidence decoy.
- Deduction gates on factual correctness (mismatch → retry), unlike Agent Briefing where recognition never gates. When speech cannot be verified, a 3-choice picture fallback keeps the check factual without trapping the child. Why: deduction is the point of this mode.
- Out of film with incomplete evidence → HQ sends 5 more photos; no fail state.

## 2026-09-25 — Deterministic scene and evidence boundaries
- The 210-second mark route and the 12 ambient NPC loops are pure data samplers, while three.js objects only consume their returned poses. Why: unit tests and `?test` automation can select exact evidence moments without depending on animation frames or wall-clock timing.
- The photo ledger stores the judged event ID privately alongside each real thumbnail. Review receives the photos but renders only neutral `PHOTO n` labels; the report is the first screen allowed to interpret and mark evidence.
- The BLOOM shopkeeper is a separate stationary character in addition to the 12 background loops. The café friend remains one of those 12, matching the population rule in the frozen spec.
- The copied recorder now imports `Sfx` as an ES module. The original classic-script copy relied on a browser global, which is unavailable in the Vite module graph.

## 2026-09-25 - Surveillance readability corrections
- Character local `+z` is the canonical forward/face direction. Faces are explicit skin-and-feature geometry on that side; long hair occupies only the top, back, and sides. Evidence poses use this convention to present Lily toward the player.
- The bike evidence lap uses the open ring around the fountain and preserves its original 16-second evidence window. Why: the former perimeter route crossed the cafe furniture and weakened the action's readability.
- The distant scene uses one extended ground mesh and one instanced low-building skyline. Why: the wide camera needs a continuous horizon while keeping the backdrop to two additional draw calls.
- Shutter availability is gated on a full-opacity surveillance frame having rendered. The test harness waits on the same readiness state and rejects thumbnails whose luminance mean and variance indicate a blank/dark capture.
