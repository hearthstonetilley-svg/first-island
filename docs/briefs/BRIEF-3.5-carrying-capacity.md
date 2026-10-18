# Brief 3.5: the island must limit its people (carrying capacity)

Round 13 (iterations 034 to 037) fixed the extinction with a measured cause, made replay exact across processes and
from Node to Chromium, and brought the pace to about one generation dial (reviewer measured mean parent age 1.03 to
1.05 dials from the event log). But the environment does no limiting: on a 12-dial run populations grow until the
200 cap stops them (seeds 42 and 2026 sit at the cap; 7 and 99 are still climbing at 176 and 149; seed 1 peaks at 117
and settles near 65). Starvation is 1 to 2 percent of deaths on every seed. The cap is doing the environment's job,
and minds built on this island would have nothing to decide. Survival is the engine (design 5.1, decision 14).

The reviewer's earlier viability band (final third between 0.5x and 1.5x the founders) is withdrawn: it tied
viability to the founder count instead of to what an island can feed. It is replaced by the test below.

## Required, in order
1. **Measure first.** Per seed and per sample: fruit regrown, fruit eaten, fruit standing, energy gained per fruit,
   energy spent per agent, fruit per tree. Commit the table. Explain from it why supply is effectively unlimited
   before any dial or rule changes.
2. **Make food the limit.** Scarcity, not the cap, must bound the population. Keep it simple and readable.
3. **The new viability test (replaces the band):**
   - at default dials the population never reaches the cap; reaching it is a failure (the cap is a safety net)
   - the food dial controls the equilibrium: run all five seeds at foodRegrowth 0.5, 1 and 2; the final-third mean
     population must rise when the dial rises and fall when it falls
   - the final third is stable: no monotonic trend across the last four samples
   - the limiting mechanism is visible in the diagnostics: agents blocked from breeding by energy, or starvation
     above a few percent of deaths
   - population above zero at every sample and a grandchild birth, as now
   - in 4 of 5 seeds at each food setting; print every curve and deaths by cause
4. Replay and determinism evals keep passing.

Order in your queue: after the readability and observer-views work you are on, and BEFORE BRIEF-4 (minds need a world
with need). Commit every iteration per AGENTS.md. Never push.
