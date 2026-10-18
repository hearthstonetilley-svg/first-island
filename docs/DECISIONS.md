# Decisions

Every decision that shapes the project, newest last. "Owner" decisions are final; others can be revisited.

| # | Date | Decision | Why | By |
|---|---|---|---|---|
| 1 | 18 Oct 2026 | Start with the most basic world: an ocean and one seeded island | Smallest visual base for everything else | Owner |
| 2 | 18 Oct 2026 | Build as we go, with a short brief per milestone, not a big plan | Toys reveal what is fun; plans would be guesswork | Owner and Claude |
| 3 | 18 Oct 2026 | Three.js with WebGPU and WebGL2 fallback, Vite, TypeScript, local first | Most capable browser stack, runs anywhere | Claude |
| 4 | 18 Oct 2026 | Public repo; every version, failures included, through a PR, review, merge and tag | The build process is part of the experiment | Owner |
| 5 | 18 Oct 2026 | Repo lives under the account hearthstonetilley-svg as first-island | Account available; owner chose the name | Owner |
| 6 | 18 Oct 2026 | Codex builds, Claude reviews in a real browser, owner directs | Tests alone passed broken pictures | Owner and Claude |
| 7 | 18 Oct 2026 | Every Codex iteration is committed with screenshots | Internal iterations are versions too | Owner |
| 8 | 18 Oct 2026 | Strongest Codex model (GPT-6.1 Sol, high) for the build | Two passes on the default model missed the visual target | Claude |
| 9 | 18 Oct 2026 | FPS counter top right; loading screen with a progress bar | Owner request after a first-load FPS drop | Owner |
| 10 | 18 Oct 2026 | Visual polish freezes; readability and performance over realism | The experiment is behaviour; agents need GPU headroom | Owner and Claude |
| 11 | 18 Oct 2026 | Agents perceive senses, not names or code; they coin their own names | Discovery must be real; the awakening is senses to definitions | Owner and Claude |
| 12 | 18 Oct 2026 | Define effects and physics, never solutions | Shelters, tools and boats must be found, not given | Claude |
| 13 | 18 Oct 2026 | Island chemistry is invented and generated per seed, unlike Earth's | Training knowledge must not be the answer key; a public fixed world would be memorised | Owner and Claude |
| 14 | 18 Oct 2026 | Survival and evolution are the engine (bodies and ideas) | No need, no learning | Owner |
| 15 | 18 Oct 2026 | The system is an evolving eval: build, society and leak evals; held-out and open tracks | Fixed evals get memorised and saturate | Owner and Claude |
| 16 | 18 Oct 2026 | Build eval on every pull request through GitHub Actions; merge on green | Catches regressions before review | Claude |
| 17 | 18 Oct 2026 | Awakening gate: an understanding threshold (enough hidden rules predicted correctly) | Earned through science | Owner |
| 18 | 18 Oct 2026 | Past the gate, agents may rewrite laws as well as state, at a heavy cost, every rewrite logged | Maximum reach, with stakes | Owner |
| 19 | 18 Oct 2026 | Natural language, but every name for a thing must be coined by the society | Readable and still honest | Owner |
| 20 | 18 Oct 2026 | About 30 minutes of real time per generation in a watched run (a dial) | Owner choice of pace | Owner |
| 21 | 18 Oct 2026 | Interventions allowed mid-run, always logged | Flexibility without losing honesty | Owner |
| 22 | 18 Oct 2026 | Held-out seeds in a private repo; aggregates published | Comparable, uncontaminated scores | Owner |
| 23 | 18 Oct 2026 | No cross-model leaderboard; minds stay swappable | Focus on one society | Owner |
| 24 | 18 Oct 2026 | Advisor consulted before each brief and before accepting each round; findings recorded in reviews | Check the work against the spec, catch what was missed | Owner |
| 25 | 18 Oct 2026 | Keep this file and JOURNAL.md current at every checkpoint, curated, never a raw transcript | A full record of the thinking, without unrelated or personal material | Owner |
| 26 | 18 Oct 2026 | Stage 2 reviews read event logs and population curves, not just screenshots | A screenshot of dots passes even when the simulation is wrong (advisor) | Claude |
| 27 | 18 Oct 2026 | Stage 3a (the clock) is published alone before bodies | Prove the foundation in isolation so a later determinism failure points at the bodies (advisor) | Claude |
| 28 | 18 Oct 2026 | Viability counts biological generations (a third-generation birth), never the clock | A clock-based count would pass with nobody having reproduced (advisor) | Claude |
| 29 | 18 Oct 2026 | The swarm is a dynamic web twice over: the social web of threads inside the world, and the compute web of parallel mind calls under councils that split, branch and merge | The owner's opening image of a torrent-like spider web of thought | Owner |
| 30 | 18 Oct 2026 | Minds use the cheapest capable models; the owner's local setup routes them through "claude -p and codex variation loops" (Haiku and Luna), isolated and budgeted, behind a pluggable router | "Super cost effective" (owner); a portable API or local-model backend keeps runs reproducible by others | Owner |
| 31 | 18 Oct 2026 | Mind answers are logged events; replay reads them and never calls a model | Keeps every run reproducible once minds exist (advisor) | Claude |
| 32 | 18 Oct 2026 | Light minds (2e) move ahead of chemistry | Seeing real thinking early informs chemistry and building; the owner left the order to Claude: "doesn't matter the order, just build" | Claude, by owner delegation |
| 33 | 18 Oct 2026 | Viability means a 12-generation run with population above zero throughout and ending between 0.5x and 1.5x the start, in 4 of 5 seeds | A 90-minute eval passed worlds that all went extinct (round 12) | Claude, advisor |
| 34 | 18 Oct 2026 | A biological generation is the mean parent age at a child's birth, about one generation dial; lifespan about 2.5 to 3 dials | Bodies were breeding three times faster than the owner's 30-minute pace | Claude, advisor |
| 35 | 18 Oct 2026 | Observer views: thought and speech bubbles on agents, a rolling thought feed, and the web as its own live page, all from the event stream; intentions shown before minds exist | "Agents should have thoughts in speech bubbles and rolling text... build the web as another visualisation" (owner) | Owner |
| 36 | 18 Oct 2026 | Supersedes 33: viability is a response test. The cap is never reached at default dials; the food dial moves the equilibrium up and down; the final third is stable; the limiting mechanism shows in diagnostics; above zero throughout with a grandchild birth; 4 of 5 seeds per food setting | The 0.5x to 1.5x founder band measured the wrong thing; a world limited only by its cap has no need in it (advisor) | Claude, advisor |
| 37 | 18 Oct 2026 | Correction to the round 12 review: biological generations were not three times too fast (measured 0.7 to 0.96 dials then; 1.03 to 1.05 now) | Inferred from maturity age alone; measurements win | Claude |
