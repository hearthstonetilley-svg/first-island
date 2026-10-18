# Journal

A curated running record of how this project came to be and how it is being built: the ideas, the conversation
between the owner and Claude, and the reasons behind each decision. Decisions are also listed on their own in
[DECISIONS.md](DECISIONS.md). Updated at every checkpoint.

## 18 Oct 2026: from a question about browser games to a research experiment

**The starting question.** The owner had been seeing striking procedurally generated games in the browser and asked
what was happening in that world. The answer: the new thing is less a new algorithm than AI coding agents writing
procedural code (noise terrain, wave function collapse, WebGPU compute shaders) for whole worlds with no art assets.

**From games to swarms.** The conversation turned to agent swarms and agent-to-agent communication. The owner's
image: turn one agent's thought process into something like a **torrent stream**, cut it into pieces, send them off
and reassemble them at the other end, a **dynamic spider web**. The catch: a torrent's file already exists and each
piece has a hash, while a thought process is mostly unwritten and step 3 depends on step 2. What does work: splitting
the independent parts (skeleton of thought, task graphs), branching on unknowns, and a checker in place of the hash.

**Quantum detour.** Could a step be chunk 2 and chunk 3 at once, like superposition? Classically, yes in spirit:
branch on each possible outcome and collapse when the answer arrives (speculative branching, costly as branches
multiply), or let all parts form at once and sharpen together (diffusion-style refinement).

**The road less travelled.** The owner wanted to avoid following anyone's exact path. The idea that emerged was the owner's:
**put a society of agents on an island with laws set by the island**, let them grow their own web, build a boat,
reach other islands, and eventually go from "there's a tree, chop it for wood" to "we can just create the tree".
The owner's reaction: "that's the design equivalent of the Matrix."

**Shaping it.**
- **Layers:** we write the rules (0); they live in them (1), understand them (2), use them (3), and finally rewrite
  them (4). The owner's framing: we rewrote the world when we defined it; once they understand the manipulation,
  they can go further.
- **Survival and evolution** are the engine, the owner insisted: without need there is no reason to learn. Evolution
  runs on bodies and, more interestingly, on ideas.
- **Growing complexity** does not happen by itself (most simulations plateau). A changing world, inventions that build
  on inventions, rivals, curiosity and a director that raises pressure keep it climbing.
- **A camera into a sandbox:** the simulation owns the world, the renderer only watches, and everything is described
  rather than drawn, so whatever they invent appears on screen.
- **Tree as a tree, or tree as code?** Agents perceive properties and outcomes, never names or code. They name things
  themselves. The awakening is precisely the step from senses to definitions. A shelter is never defined; rain, wind
  and cover are, and a shelter is anything that works.
- **A periodic table?** Only if the world is made of elements with hidden rules, and those rules must be unlike
  Earth's, or the AI minds would recall answers instead of discovering them.
- **The system is an eval**, the owner observed, and it should evolve: generated chemistry per seed so it cannot be
  memorised, a director so it cannot be saturated, and a held-out track for honest scores.

## 18 Oct 2026: how it is built

- **In public, every version.** The owner: every version goes to the public repo through the full GitHub process,
  failures included, because the build process is part of the experiment.
- **Codex builds, Claude reviews, the owner directs.** Codex writes code from short briefs; Claude reviews every round
  in a real browser and sends specific fixes. Early rounds showed why: tests passed while the picture was broken
  (a hidden ocean, a black ocean, identical islands, a start-up hang).
- **Iterations count too.** The owner noticed Codex had gone through several undocumented internal versions inside
  one run. Since then every iteration is committed with its screenshots in docs/iterations.
- **Writeback.** A Codex notify hook writes its last message to a file so the reviewer never misses a finish, an
  approval prompt or a question.
- **Evals and CI.** A build eval loads every seed in two renderer modes and checks for a real island; it found a
  WebGPU device-loss bug on its first run and now gates every pull request.
- **Real hardware matters.** The owner's machine showed the loader measuring 10 fps on hardware that runs at 80 to 100;
  no headless test could have caught it.
- **Advisor at every checkpoint.** The owner asked that Claude consult its advisor before each new brief and before
  accepting each round, to check the work against the spec and catch what was missed. Its first consult changed how
  stage 2 is reviewed: for a simulation, a screenshot of dots passes even when the simulation is wrong, so reviews
  read the event logs and population curves instead.

## 18 Oct 2026: the first agents, and what "real agents" means

- The simulation clock shipped on its own (v0.4.0), proven deterministic across separate processes before any body was
  built on it. Bodies followed: about 20 agents that eat, rest, reproduce and die, driven by simple scripts.
- **"But the agents are not real agents?"** the owner asked. Right: they are bodies with scripted needs and no thinking.
  The design held minds back until there was something to think about. The owner pushed on cost and on the swarm:
  minds should run on "super cost effective" models, split across "claude -p and codex variation loops".
- A quick test settled feasibility: Haiku through `claude -p` and Luna through `codex exec` each answer in 3 to 4
  seconds from an isolated, empty folder. It also gave the first leak: shown only "a tall swaying thing with round
  soft things hanging from it", Haiku replied with "tree" and "fruit". Earth knowledge walks straight in unless
  the leak eval stops it.
- **"How do we get to the swarm, the dynamic spider web?"** Through talking, which makes the threads, and councils,
  where groups choose to split, branch and merge. Underneath, the mind router runs those pieces in parallel: the
  owner's original torrent of thought, running for real (design section 8a).

## Next

Stage 2: the simulation clock and the first agents (bodies only, no AI minds yet). See docs/briefs/BRIEF-3-first-agents.md.
