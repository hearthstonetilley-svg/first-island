# Astra audit 9 (GPT-6-Astra), 19 Oct 2026: sandbox-v8 b775e6b

Run visibly in tmux window island:audit. Brief:

> Adversarial audit of commit b775e6b on branch sandbox-v8 (First Island sandbox v0.8, draft PR #25). Do not edit files.
> Base is 70fcf10 (v0.7, your pass 7 said ready). Review only what b775e6b adds: agents name places (9x9 GRID regions,
> name_place action, /api/places, map panel, names drawn on the island; built-in place names removed from prompts),
> councils on disagreement (readClaim parses spoken recipe claims; a contradiction starts a council), the recitation
> score (recall: first-try named guesses per model), the director (after SANDBOX_DIRECTOR_MS with no progress the sea
> washes a material ashore, logged as a director event), web strands fading via lastPassed, and the test hooks know and meet.
> Owner rules that must still hold: the loading, FPS, adaptive quality and recovery contract; the camera never moves
> on its own unless Follow is on; no flashes; evals make zero model calls; items are conserved; nothing personal leaks.
> Known: local eval was 50/53 under load, two drag-ends-follow checks failed, possibly from load, unconfirmed.
> List defects worst first with file:line and the smallest fix, say whether the two drag failures are load or a real
> regression, and end with one line: ready to leave draft, yes or no; if no, only what must change before it.

## Verdict, verbatim

Audited **70fcf10 → b775e6b**. No files edited.

1. **HIGH: the map covers the island and intercepts dragging.** [sandbox.css:123](src/sandbox/sandbox.css:123) inherits `position: fixed; inset: 0` from the global canvas rule. At 1400×820, the map occupies 1400×812. Browser hit-tests at both eval drag coordinates hit `.map-canvas`; the saved screenshot also shows the island obscured. **Both drag failures are real regressions, not load.** Smallest fix: add `position: static; inset: auto` to `.map-canvas`. Verified in memory: the map returns to its panel and both coordinates hit the island canvas.

2. **HIGH: disagreement can put one agent in two councils.** [sandbox.ts:354](server/sandbox.ts:354) starts a council during speech processing, then continues executing the same decision. If its action is `council`, it starts another council despite its new membership. Reproduced with the actual functions: council 1 contained `[2,0,1,3,4,5]`, council 2 contained `[1,6,7]`. Their cleanup can clear the shared agent’s membership while the other council still runs. **Smallest fix:** stop action processing once the speaker joins a council, and reject an already-enrolled chair at council entry.

3. **MEDIUM: recitation counts learned answers as first tries and attributes scripted guesses to models.** [sandbox.ts:305](server/sandbox.ts:305) returns for missing/untested predictions before recording the attempted pair. Reproduced: make sparks without a prediction, repeat with “sparks”, and recall becomes `1/1`. Additionally, [sandbox.ts:319](server/sandbox.ts:319) uses the assigned model even when a cap or error caused scripted fallback. **Smallest fix:** record every executed attempt before scoring returns; pass the actual decision source into `judge`. Replace the UI’s “knowledge from training” assertion with the measured first-attempt score.

4. **MEDIUM: claim parsing discards negation and alternatives.** [sandbox.ts:124](server/sandbox.ts:124) accepts any suffix matching a material. Actual-function probes interpret both “makes no sparks” and “makes fire or sparks” as “makes sparks”. This suppresses genuine contradictions or starts councils on ambiguous statements. **Smallest fix:** require whole material names and one unambiguous outcome; handle negation explicitly or reject it rather than treating it as affirmative.

5. **MEDIUM: the disagreement eval is neither deterministic nor proof of a council.** [eval-sandbox.mjs:181](scripts/eval-sandbox.mjs:181) selects fixed agents after substantial simulated time. `know` and `meet` do not ensure they are awake, outside councils, or outside the pair cooldown. The assertion also accepts any historical `disagreement`, without checking a corresponding council opened. This is the third failure in the saved 50/53 report; its exact runtime cause is unrecorded. **Smallest fix:** establish eligible participants and cooldown state, then require fresh, matching disagreement and council-open events.

6. **MEDIUM: restart loses the director’s inactivity deadline.** [sandbox.ts:163](server/sandbox.ts:163) initializes `lastProgressSim` and `lastFound`, but persistence omits both. With existing discoveries, restarting resets the inactivity clock on the first tick, postponing an already-due intervention. **Smallest fix:** persist and restore both values, with initialization for older saves.

Validation: TypeScript passed; targeted browser and actual-function reproductions confirmed findings above. I inspected the existing eval report and screenshot; I did not rerun the full eval. No additional conservation or model-call-path regression confirmed.

**Ready to leave draft: no; fix these six defects and rerun the visual and zero-call eval gates.**
