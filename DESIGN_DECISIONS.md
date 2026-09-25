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
