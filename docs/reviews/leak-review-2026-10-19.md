# Leak review: first live play test (2026-10-19)

Data: the owner's first full play test, eight agents on Haiku, real-world chemistry, seed 1.
Read from the live save (`sandbox-seed-1.json`, 400 most recent events) and `/api/facts`, `/api/skills`.
No model calls were made for this review.

## Question

Do the minds recite the island's recipe table, or do they discover by trying?
With real-world chemistry (decision 49) the minds are meant to bring real knowledge, so knowing
that cord and wood lash into a frame is allowed. A leak would be naming results the real world
would not predict, or naming results before any trial with suspicious accuracy.

## Findings

1. **No recitation seen.** Wrong guesses are the kind a person would make: sparks from striking
   driftwood, sand or cord; a flint flake from striking pyrite, wood or water; fire from water and
   cord. One agent expected nothing from striking flint and got a flint flake. A mind reading the
   table would not make these mistakes.
2. **Real discoveries came from trials.** Cord (plant fibre twisted together) and frame
   (wood lashed with cord) were each predicted and then confirmed by doing. One agent wrote the
   skill "make cord" from its own steps.
3. **The score is inflated.** 77 of 115 predictions were marked right (67%), but most right marks
   are "expected nothing, got nothing". That is cheap and says little. Of the predictions that named
   a product, only cord and frame were right.
4. **Facts are honest.** 106 shared facts, mostly locations and "X + Y makes nothing" results,
   which is what exhaustive trial and error looks like.

## Recommendation

Score named-product predictions separately from "nothing" predictions on the hypotheses panel,
so the headline number measures real foresight. The v0.8 recitation score (`recall`, first-try
named guesses per model) already counts only named guesses and should become the headline.

Verdict: no leak found in this run. Repeat the review on the held-out seeds once they rerun.
