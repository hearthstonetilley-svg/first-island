# Round 12 (iterations 030 to 033): REJECTED. Every seed goes extinct.

Reviewer's long run (default dials, frozen copy of 63b7594, population sampled every 1800 ticks = one generation dial):

| seed | population per 1800 ticks | births | max biological generation | deaths by cause |
|---|---|---|---|---|
| 1 | 38 20 9 3 1 0 0 0 0 0 0 0 | 49 | 8 | old age 49 |
| 7 | 28 12 10 5 6 5 2 0 0 0 0 0 | 48 | 10 | old age 45, starvation 3 |
| 42 | 34 17 9 5 2 0 0 0 0 0 0 0 | 49 | 10 | old age 48, starvation 1 |
| 99 | 35 16 8 5 1 0 0 0 0 0 0 0 | 46 | 6 | old age 43, starvation 3 |
| 2026 | 32 11 7 5 5 1 0 0 0 0 0 0 | 44 | 10 | old age 42, starvation 2 |

A birth boom in the first 1800 ticks, then births stop and the population dies of old age. The builder's viability
eval passed because it stopped at 5,400 ticks (during the decline) with a pass line of two agents alive.

## Required, in this order
1. **Instrument before changing anything.** At every sample point, count living agents failing EACH reproduction
   condition separately: age window, cooldown, health, energy, rest, warmth, partner in range. Commit that table for
   all five seeds. Find the cause from it. Do not move any threshold or dial until the table explains the collapse,
   and state the cause in the iteration note.
2. **Pin the pace (spec gap in decision 20).** A biological generation is the mean parent age at a child's birth and
   must be about one generation dial (1800 ticks by default). Lifespan about 2.5 to 3 dials. Today maturity is 0.3 of
   a dial, so biological generations run about three times too fast.
3. **Viability, replacing my earlier definition** (which would also pass these extinct worlds): run at least 12
   generation dials (21,600 ticks at default); population above zero at every sample; at least one third-generation
   birth; and population in the final third of the run between 0.5x and 1.5x the starting count. Required in 4 of 5
   seeds. The eval output must print each seed's curve and deaths by cause, like the table above.
