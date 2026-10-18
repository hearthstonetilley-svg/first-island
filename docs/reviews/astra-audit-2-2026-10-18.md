# Second adversarial audit by GPT-6-Astra, 18 Oct 2026 (commit 316a71b)

Run visibly in the island tmux window `audit`, read-only. Captured from its transcript view.

**Verdict:** No. 316a71b is not ready for the owner's first play test. Several repairs are real, but the "ACCEPTED" review overstates closure. There is a new unbounded timer leak, incorrect hypothesis scoring, a model-output crash path, and incomplete council limits and camera ownership.

```
Verified HEAD 316a71b on sandbox-v3, with a clean worktree. No files changed or model calls made. I inspected code and the
  supplied screenshots and ran isolated, in-memory reproductions. I did not rerun the full eval, which writes files and
  screenshots.
  1. Verification of the ten earlier findings
   #      Finding                                      Status                     Code verification
  ━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1      Recovery strands entry/adaptation and        Fixed for those defects    Recovery creates an attached loader,
          loses structures                                                        cancels the old loop, restores the
                                                                                  structure map and resumes adaptation for
                                                                                  an entered owner. src/sandbox/main.ts:470,
                                                                                  src/sandbox/main.ts:491, src/sandbox/
                                                                                  main.ts:504. Full camera preservation has
                                                                                  an exception under #7. Device-loss
                                                                                  behavior remains unverified visually.
  ─────  ───────────────────────────────────────────  ─────────────────────────  ────────────────────────────────────────────
   2      Lowest quality remains expensive             Partly fixed               Minimal requests direct rendering and
                                                                                  1024² shadows; overlay DPR is capped. src/
                                                                                  render/quality.ts:65, src/render/
                                                                                  scene.ts:509, src/sandbox/main.ts:375. The
                                                                                  supplied screenshot still shows 1 fps /
                                                                                  1226.3 ms at minimal. That proves this
                                                                                  software-renderer experience remains
                                                                                  unusable, not that the owner’s GPU will
                                                                                  perform identically.
   3      Web rebuilds unchanged information           Partly fixed               Static canvas redraws now stop when idle,
          continuously                                                            and ordinary agent positions are
                                                                                  stationary. But RAF continues, computes
                                                                                  signatures, and creates a new repeating
                                                                                  debug timer every frame. src/sandbox/
                                                                                  web.ts:193. “Zero draws” conceals growing
                                                                                  background work.
   4      Eval can spend and does not establish        Partly fixed               Both budgets are zero, total calls are
          performance                                                             checked, diagnostics are connected, and
                                                                                  adaptation is asserted. scripts/eval-
                                                                                  sandbox.mjs:20, scripts/eval-
                                                                                  sandbox.mjs:164, src/sandbox/main.ts:445.
                                                                                  Still one forced renderer, no recovery
                                                                                  exercise, no acceptable-cadence gate, and
                                                                                  screenshot failures remain swallowed at
                                                                                  scripts/eval-sandbox.mjs:18.
   5      Councils bypass limits and Pause             Partly fixed               Shared concurrency, insufficient-item
                                                                                  skips, and unmeasured Codex cost labeling
                                                                                  exist. But the rate-cap check precedes an
                                                                                  await, and paused councils continue
                                                                                  executing their fallback actions. server/
                                                                                  sandbox.ts:385, server/sandbox.ts:430,
                                                                                  server/sandbox.ts:568.
   6      Reload flashing before loader exists         Fixed in code              Both HTML files provide an initial dark
                                                                                  background; island chrome is hidden before
                                                                                  insertion. sandbox.html:9, web.html:9,
                                                                                  src/sandbox/main.ts:19. Still screenshots
                                                                                  cannot establish flash-free reload or
                                                                                  recovery; no filmstrip was supplied.
   7      Camera ownership broken                      Partly fixed               Free and keyboard cancellation work. Drag/
                                                                                  wheel cancellation is conditional on a
                                                                                  current internal follow/glide, so it
                                                                                  misses settled group-follow mode. Resize/
                                                                                  panel toggles still reframe Island mode.
                                                                                  Recovery restores a pose then resets
                                                                                  individual-follow distance/pitch. src/
                                                                                  render/scene.ts:536, src/sandbox/
                                                                                  main.ts:112, src/sandbox/main.ts:493, src/
                                                                                  sandbox/main.ts:503.
   8      Fact selection does not isolate; facts       Partly fixed               Selected ownership links now filter
          move                                                                    correctly. Positions stay stable only
                                                                                  through 160 facts; thereafter every
                                                                                  addition rescales all existing positions.
                                                                                  src/sandbox/web.ts:157, src/sandbox/
                                                                                  web.ts:58.
   9      Layout clips and reserves hidden panels      Partly fixed               Measured island insets and hidden-web-
                                                                                  inspector handling are present. Narrow
                                                                                  toolbar overflow remains: the mixer alone
                                                                                  reserves 250px, alongside nonshrinking
                                                                                  primary controls and readouts. The eval
                                                                                  omits the earlier requested 640px case.
                                                                                  src/sandbox/main.ts:83, src/sandbox/
                                                                                  sandbox.css:98, scripts/eval-
                                                                                  sandbox.mjs:155.
   10     Older thoughts overwrite newer thoughts      Fixed for ordering         Arrivals land chronologically and sequence
                                                                                  checks reject stale updates; card
                                                                                  rectangles are read once per frame. src/
                                                                                  sandbox/main.ts:164, src/sandbox/
                                                                                  main.ts:415. The claimed packet bound is
                                                                                  incomplete: a queue containing only
                                                                                  thought packets can exceed 200 at src/
                                                                                  sandbox/main.ts:363.
  2. New defects and failed fixes, worst first
  1. HIGH · The debug web accumulates timers without limit.
     setInterval(..., 200) sits inside draw(), before the idle return. Every RAF adds another permanent interval. My isolated
     execution of that source block registered 600 intervals from 600 draw invocations. At a nominal 60 RAF/s, one minute
     would register 3,600 intervals, each scheduled five times a second.
     The eval explicitly opens web.html?debug=1, so this corrupts the diagnostic environment itself. An additional assignment
     at the end of drawing replaces __WEB__ with an object lacking selectFact, litLinks, and knowers, creating intermittent
     debug API failures.
     Evidence: src/sandbox/web.ts:194, src/sandbox/web.ts:230.
     Fix: initialize one stable debug object outside RAF, preferably with getters and no interval.
  2. HIGH · A malformed prediction can reject an uncaught mind task and terminate the server.
     judge() calls expect.trim() before converting or validating the value. Valid JSON such as "expect": {"result":"cord"}
     therefore throws. The router only parses JSON; the TypeScript Decision cast supplies no runtime validation. think() has
     cleanup but no catch around act(), and its promise is discarded.
     I reproduced expect.trim is not a function. On a successful strike, inventory has already changed before this exception.
     Evidence: server/sandbox.ts:177, server/sandbox.ts:237, server/sandbox.ts:347, server/sandbox.ts:378.
     Fix: validate the decision schema before mutations and contain failures at the asynchronous task boundary.
  3. HIGH · Hypothesis RIGHT/WRONG marks are demonstrably unsound.
     The judge tests whether result words occur as substrings, without understanding negation, alternatives, or synonyms.
     Executing its exact normalization and matching expressions produced:
      Prediction        Actual result    Current mark
     ━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━
      not cord          cord             RIGHT
     ────────────────  ───────────────  ──────────────
      no fire           fire             RIGHT
      fireproof tool    fire             RIGHT
      rope              cord             WRONG
      not nothing       nothing          RIGHT
     The rope case is particularly indefensible: the material description explicitly calls cord “twisted plant fibre rope.”
     Worse, an unsupported proposal is first counted as WRONG, then potentially emitted as an untested idea. Those are
     incompatible claims. Missing recipes establish only that the simulation does not implement a reaction. They cannot
     establish that a real-world hypothesis is false.
     Evidence: server/sandbox.ts:175, src/sandbox/realworld.ts:30.
     Fix: use validated canonical predicted outcomes with explicit aliases. Separate correct, incorrect, missing/invalid
     prediction, and untested proposal. Label the score as agreement with implemented island rules.
  4. HIGH · “Every combine or strike carries a prediction” is false.
     Scripted strikes have no expect. Scripted council fallbacks have no expect. Skill schemas discard it, and skill
     execution never passes it. Ordinary model replies can omit it and still perform the action. judge() silently excludes
     all these attempts from the denominator.
     Consequently, the hit rate is a selectively sampled statistic, not a measure of all experiments.
     Evidence: server/sandbox.ts:92, server/sandbox.ts:315, server/sandbox.ts:367, server/sandbox.ts:434.
     Fix: carry predictions through every action path and visibly record missing predictions rather than silently excluding
     them.
  5. HIGH · Council budget enforcement has a new admission race; Pause is still incomplete.
     Parallel council calls all test within() before awaiting waitForSlot(). None rechecks the budget after admission. An
     isolated reproduction of this ordering admitted three calls with a cap of one, even with immediately available slots.
     The change also leaves MIND_CONCURRENCY declared but unused, replacing its default of two with MAX_IN_FLIGHT defaulting
     to three.
     Pause prevents further model admissions while paused, but returns executable fallback answers. Those answers still flow
     through pooling, combining, judging, teaching, and merging. An already-running response also reaches these mutations
     without a pause check.
     Evidence: server/sandbox.ts:21, server/sandbox.ts:288, server/sandbox.ts:388, server/sandbox.ts:424.
     Fix: reserve concurrency and budget together immediately before launch; preserve the configured limit. Pause must
     suspend or cancel council execution with explicit inventory cleanup.
  6. MEDIUM · Manual camera input can still be overwritten.
     Reproduction from code: select group Follow, wait until its glide settles, then drag or wheel before the next group
     refresh. With neither followed nor glide active, manualCamera() does not notify the page. Page mode remains agents; the
     next 2.5-second refresh calls frameAgents() again.
     Similarly, dragging a settled Island view leaves mode as Island, allowing a later resize or panel toggle to overwrite
     the manually adjusted view.
     Evidence: src/render/scene.ts:536, src/sandbox/main.ts:525.
     Fix: every genuine drag/wheel operation must transfer ownership to Free, regardless of current internal animation state.
  7. MEDIUM · “Minimal” is reported before the renderer has actually switched.
     Quality state advances immediately, while the direct-render path compiles asynchronously. Compilation failure is
     silently swallowed, leaving the previous drawing path active beneath a “minimal” HUD. A late successful compile can also
     overwrite a subsequent quality choice.
     Evidence: src/render/scene.ts:513, src/sandbox/main.ts:518.
     Fix: distinguish requested from applied quality; guard asynchronous completion against obsolete requests and expose
     failure. The existing screenshot does not prove which drawing path actually ran.
  3. Smallest set required before play
  • Fix the debug timer leak and stabilize the debug API.
  • Validate model decisions; repair prediction matching, missing-prediction accounting, and untested-idea classification.
  • Make council budget admission atomic and Pause stop council mutations.
  • Make manual camera ownership unconditional.
  • Report applied rendering quality accurately, then verify cadence on the owner’s GPU, reload/recovery filmstrips, and the
    missing narrow layout.
  Keep the zero-call eval. Add focused checks for the reproduced defects. A green eval that tolerates missing screenshots,
  accepts 1 fps, and only checks that some hypothesis event exists does not justify play-test acceptance.
  
```
