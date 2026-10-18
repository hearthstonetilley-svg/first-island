# Adversarial audit by GPT-6-Astra, 18 Oct 2026 (commit 57ecc8b)

Run visibly in the island tmux window `audit`. Verbatim.

**Verdict: the startup contract is only partially restored.** Recovery can strand a slow renderer, “Free” can keep following an agent, and the eval can pass at 1 fps while launching real model calls.

Read-only audit of `57ecc8b` and the supplied screenshots. No files changed or model calls made. Performance causes below are code-backed candidates, not measured GPU timings; the software-renderer screenshot does not establish real-GPU performance.

1. **HIGH · Live graphics recovery can leave quality adaptation permanently disabled.**

   After entry, `LoadingScreen.finish()` removes its element. Recovery reuses that object, starts a fresh readiness gate, and sets `playing=false`. If WebGL2 is slow, `limited()` exposes an Enter button on the **detached element**. The owner cannot enter; adaptive quality never starts. Errors also go to that detached loader. Recovery restores only the original `built` array, losing structures created since connection.

   Evidence: [main.ts:414](src/sandbox/main.ts:414), [main.ts:424](src/sandbox/main.ts:424), [loading.ts:82](src/ui/loading.ts:82).

   **Smallest fix:** distinguish initial startup from recovery. Recreate an attached recovery/error surface, preserve whether the owner already entered, and resume post-entry quality sampling after recovery. Maintain structures in a client-side map updated by hello and build events; rebuild from that map.

   **Prove it:** inject device loss before entry and during play, including slow fallback. Verify one render loop, reachable controls, advancing quality samples, visible errors, and identical structure IDs before/after.

2. **HIGH · “Low” quality still retains substantial rendering costs.**

   Low disables AO but retains bloom and the normal MRT attachment. Shadows remain 2048²; ocean geometry remains 100,352 triangles. Meanwhile, the overlay ignores adaptive resolution and renders at uncapped `devicePixelRatio`. Screenshot #1 shows **1 fps / 1269.7 ms at low**, demonstrating that the fallback reaches its floor without resolving that environment’s problem.

   Evidence: [scene.ts:96](src/render/scene.ts:96), [scene.ts:380](src/render/scene.ts:380), [scene.ts:407](src/render/scene.ts:407), [main.ts:335](src/sandbox/main.ts:335).

   **Smallest fix:** first compare `?post=0` with default rendering. If that isolates the cost, make the lowest tier use a prewarmed direct-render path without bloom/MRT. Tie overlay resolution to a capped quality ratio. Measure shadows and ocean separately before reducing either.

   **Prove it:** record CPU render time and frame-interval median/p95 with post on/off, overlay on/off, and reduced shadows. Compare identical cameras on real hardware and software rendering separately. Do not claim an FPS gain from code inspection.

3. **HIGH · The web spends frames rebuilding information that barely changes.**

   It clears a full-device-resolution canvas every RAF, composites another full-resolution canvas, recounts every fact holder, reruns classifications, and redraws text. Cached knowledge links update once per second while their agent endpoints move continuously, so the cache also introduces visible endpoint jumps.

   Evidence: [web.ts:119](src/sandbox/web.ts:119), [web.ts:150](src/sandbox/web.ts:150), [web.ts:167](src/sandbox/web.ts:167), [web.ts:208](src/sandbox/web.ts:208).

   **Smallest fix:** cache fact positions, classifications and holder counts on data/viewport changes. Cap canvas DPR. Make agent positions stationary by default, which lets cached links remain accurate; animate packets on demand and redraw static content only when dirty.

   **Prove it:** measure idle and burst frame costs at DPR 1 and 2, with 85 and several hundred facts. Idle should stop continuous drawing when nothing animates. Link endpoints must remain attached.

4. **HIGH · The performance eval does not establish performance, and can spend model quota.**

   The “adaptive quality” assertion checks only a numeric FPS string and a valid quality label. It does not require adaptation or acceptable cadence. It tests one forced-WebGL2 island, no device-loss recovery, and checks the web by counting nontransparent pixels. Screenshot failures are swallowed.

   Worse, the server starts running and the mixer test changes scripted agents to actual backends before restoring scripted mode. `MIND_MODE=scripted` is an initial setting, not a model-call prohibition.

   Evidence: [eval-sandbox.mjs:18](scripts/eval-sandbox.mjs:18), [eval-sandbox.mjs:55](scripts/eval-sandbox.mjs:55), [eval-sandbox.mjs:72](scripts/eval-sandbox.mjs:72), [server/sandbox.ts:314](server/sandbox.ts:314).

   The sandbox also never instantiates `FrameDiagnostics`, so `?debug=1` lacks the required 600-frame report.

   **Smallest fix:** set both call caps to zero in the eval environment; assert zero calls. Wire existing `FrameDiagnostics` into sandbox startup and rendering. Add explicit adaptation, recovery and camera assertions across auto/WebGL2 and multiple seeds. Require visual evidence for visual acceptance.

   **Prove it:** deliberately break quality switching and recovery; the eval must fail. Confirm zero provider launches. Obtain the 600-frame report with startup phases, slow-frame counts and quality transitions.

5. **HIGH · Councils bypass the normal concurrency limit and continue spending after Pause.**

   Ordinary minds use `inFlight`; council calls do not. Council fan-out uses `Promise.all`, including calls for members explicitly described as having too few items to combine. Subsequent stages do not recheck `running` or viewers. The router’s cost/token accounting covers Claude envelopes only, making aggregate totals incomplete when Codex participates.

   Evidence: [sandbox.ts:354](server/sandbox.ts:354), [sandbox.ts:394](server/sandbox.ts:394), [router.ts:48](server/router.ts:48).

   **Smallest fix:** route both purposes through one concurrency semaphore. Recheck pause/viewer state before admitting each stage, with safe cleanup of dealt inventory. Return deterministic insufficient-item results without a model call. Label unmeasured token/cost usage as unknown.

   **Prove it:** use a fake provider to record peak concurrency, starts after Pause, and calls for impossible parts. Verify inventory conservation when a council stops.

6. **HIGH · Reload flashing is still possible before the loader exists.**

   Both HTML documents start empty and obtain background styling through JavaScript imports. The island then inserts the toolbar before receiving hello; only `startIsland()` hides it and creates the loader. The sequence can be **unstyled page → toolbar → loader → island**. This is a code-supported flash risk, not something a still screenshot can confirm.

   Recovery also replaces the displayed canvas with a hidden one before rebuilding.

   Evidence: [sandbox.html:1](sandbox.html:1), [web.html:1](web.html:1), [main.ts:18](src/sandbox/main.ts:18), [scene.ts:259](src/render/scene.ts:259).

   **Smallest fix:** put the dark background and initial loading shell directly in HTML; initialize loading state before application execution. Keep a stable dark recovery surface until the replacement frame is ready.

   **Prove it:** capture cold-cache reload filmstrips with delayed modules and delayed hello, plus device recovery. Check for bright blank frames and toolbar appear/disappear transitions.

7. **HIGH · Camera ownership is broken.**

   Clicking Free only changes the page’s `mode`; it does not clear `followed` or `glide` inside the scene. Q/E and R/F clear glide but leave individual following active. Mouse drag/wheel do not cancel follow either. Resize, panel toggles and recovery can also reframe island mode.

   Evidence: [main.ts:92](src/sandbox/main.ts:92), [main.ts:437](src/sandbox/main.ts:437), [scene.ts:528](src/render/scene.ts:528), [scene.ts:562](src/render/scene.ts:562).

   **Smallest fix:** add one `cancelAutomaticCamera()` operation clearing both follow and glide. Invoke it for Free and manual camera input. Preserve the full camera pose through recovery; resize should update projection without resetting pose.

   **Prove it:** follow an agent, choose Free, then let the agent move. Position, target, yaw, pitch and distance must stay fixed. Repeat after resize, panel toggles and recovery. The current eval checks only target X/Z.

8. **MEDIUM · The web’s “trace a fact” view does not isolate that fact.**

   Selecting a fact brightens every knowledge edge belonging to its holders. It never filters the inner edge loop to the selected fact. Screenshot #2’s dense mesh therefore remains dense precisely when the owner asks for an explanation. Fact locations also shift whenever `facts.length` grows.

   Evidence: [web.ts:50](src/sandbox/web.ts:50), [web.ts:157](src/sandbox/web.ts:157).

   **Smallest fix:** when `focusFact` exists, draw only edges whose fact ID matches it. Keep fact positions stable as new facts arrive. In the default view, emphasize recent transfers and selected relationships.

   **Prove it:** select a fact known by three agents: exactly three highlighted ownership links. Add unrelated facts: the selected target stays put.

9. **MEDIUM · Layout wastes space and breaks at smaller widths.**

   Screenshot #1 already clips the camera controls and progress text. CSS hides the right rail below 900px, but camera insets still reserve its 312px. Below 640px, the left rail becomes a bottom panel while the camera still reserves left-side width. The web always subtracts 312px, even when its inspector is hidden.

   Evidence: [sandbox.css:68](src/sandbox/sandbox.css:68), [main.ts:76](src/sandbox/main.ts:76), [web.ts:45](src/sandbox/web.ts:45).

   **Smallest fix:** derive insets from actual visible panel rectangles and share that layout calculation with tags and packets. Give secondary toolbar controls an overflow area instead of shrinking primary camera controls.

   **Prove it:** inspect 1400, 1200, 900 and 640px layouts. All primary controls must remain reachable, with no camera space reserved for hidden panels.

10. **MEDIUM · Thoughts can arrive visually out of order.**

    Packets are processed backwards. If a slow frame advances beyond several arrivals, the newest thought lands first and the older one then overwrites it. At the screenshot’s frame time, multiple 700ms arrivals can expire together. Packet destinations also trigger layout reads inside the drawing loop.

    Evidence: [main.ts:317](src/sandbox/main.ts:317), [main.ts:376](src/sandbox/main.ts:376).

    **Smallest fix:** process completed arrivals chronologically or reject stale event sequence numbers in `land()`. Cache card rectangles before drawing; bound the pending queue.

    **Prove it:** queue three thoughts, stall rendering for two seconds, then resume. The box must show the newest thought and never regress.

The strongest first patch is recovery state, camera cancellation, zero-call eval isolation, and real diagnostics. Then use those measurements to choose the rendering reductions. Adding more visual effects now would compound the existing performance and readability problems.
