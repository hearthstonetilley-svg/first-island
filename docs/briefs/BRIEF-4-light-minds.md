# Brief 4: light minds (design stage 2e)

Read docs/design/world-and-agents.md sections 5.2 to 5.5, 9a, 11 and 13 first. A handful of agents get a real AI mind.
Everything else stays scripted. **Prerequisite: docs/briefs/BRIEF-3.5-carrying-capacity.md must be done and its
viability test passing first. If it is not, do BRIEF-3.5 now and come back to this brief afterwards.**

## 4a. The mind server (local only)
- The browser cannot run command-line tools, so add a small Node server bound to 127.0.0.1 only (dev script
  `npm run minds`). The simulation worker asks it for thoughts over HTTP. Nothing listens beyond localhost.
- **Backends behind one interface:** `claude-cli` (`claude -p --model haiku`), `codex-cli` (`codex exec -m gpt-5.6-luna
  -c model_reasoning_effort=low --ephemeral -s read-only`), and `mock` (deterministic, used by tests and CI).
  The router rotates between enabled real backends.
- **Isolation, enforced per call:** run from an empty temporary folder; Claude with `--tools "" --setting-sources ""
  --strict-mcp-config --mcp-config <empty> --no-session-persistence --system-prompt <fixed>`; Codex with its own empty
  `CODEX_HOME` holding only the auth it needs, so no AGENTS.md, memories or config from the owner load.
- **Isolation verified at start-up:** ask each backend to quote verbatim any instructions, rules, files, memory or
  context it received besides its system prompt (asking "what do you know about me" is useless: models answer
  "nothing" either way). Reject the backend if the answer contains anything from a deny-list file kept OUTSIDE the
  repo at `~/.config/first-island/deny-list.txt` (the owner's names, email and project names; never copy its contents
  into the repo, logs or tests; tests use a fixture list). Write the result to the run log. A failed backend stays disabled.
- **Reviewer findings, 18 Oct 2026 (build on these):** with the default Codex home, `codex exec` passes the owner's
  entire global AGENTS.md to the model; with a private empty `CODEX_HOME` holding only `auth.json`, it does not. So the
  private CODEX_HOME is mandatory. `claude -p` with the flags above loads no CLAUDE.md, memory or rules, but Claude
  Code always injects the account email as context; flags cannot remove it.
- **Output scrubbing:** every answer from every backend is scrubbed against the deny-list (including the email) before
  it is logged, displayed or stored. A scrubbed answer is logged as scrubbed, never with the removed text.
- **Budget and back-off:** per backend, a hard cap on calls per hour (default 120) and on concurrent calls (default 2);
  on errors or limit messages, back off exponentially and fall back to the other backend or to scripted behaviour.
- **A lock on the door:** the server checks the Origin header against the dev server's origin and requires a per-run
  secret that it prints at start and the page sends in a header. Any other request is refused. (Anything on 127.0.0.1
  is reachable by any web page the owner has open, and this server spends the owner's plans.)

## 4b. Thinking inside a deterministic world
- Dials: number of minded agents (default 5), think interval in simulated seconds, run budget of mind calls.
- A mind is asked to think on a schedule and on triggers (a need turning critical, something new perceived).
- **Cadence against speed and budget (decided, not left open):** minds think on a wall-clock cadence bounded by the
  budget, not on simulated time, so 100x cannot drain the budget in seconds. Above 10x, minds pause and bodies run on
  their scripts. The HUD always shows mind status, for example "minds: 3 of 5 thinking, 41/120 this hour" or
  "minds paused above 10x". Running out of budget or falling back must be visible, never silent.
- **The simulation never waits.** It requests a thought at tick T; the agent keeps its scripted behaviour until the
  answer arrives; the answer is applied at the tick it arrives and logged as an event with that tick, the prompt, the
  answer, the backend and model. **Replay reads the logged answer at the logged tick and never calls a model.**
  The replay eval must pass on a run with minds.
- **Senses only.** A describer turns what the agent perceives into property descriptions ("a tall swaying thing; round
  soft things hang from it; they fell when it was struck") and never uses our nouns. Unit-test the describer AND the fixed system
  prompt against a banned-word list (tree, fruit, food, water, wood, stone, rock, fire, sea, island, leaf, and
  similar), matching stems and plurals ("trees", "fruits").
- **The mock backend is deterministic in ticks, not just content:** it runs in-process inside the worker and delivers
  its answer exactly N ticks after the request (N a constant). Live determinism (the separate-process eval) therefore
  holds with mock minds. A live run with real backends is reproducible only through replay, never run to run; every
  eval states which mode it ran in.
- **Answer format:** strict JSON: one verb from the verb list, a target id from what it perceives, a short thought
  (one or two sentences), and optionally names it coins for perceived things. Invalid answers fall back to the script
  and are logged.
- **Coined names:** an agent may name a perceived thing. Its own later prompts use its coined names for those things.
  (Sharing names between agents comes with speech, stage 2f.)

## 4c. Seeing and measuring it
- Thoughts appear as thought bubbles and in the rolling feed (observer views 1). Thought text is the agent's own;
  any observer label stays visibly separate.
- **Leak eval:** every thought and coined name is checked against an Earth-concept list, matching stems and plurals.
  (First evidence: shown only a senses description, Haiku answered "tree" and "fruit".) Report the leak rate per
  backend and model; mark leaks in the feed with an observer marker. Not a pass/fail gate yet, a measurement.
- Report per run: calls per backend, failures and fall-backs, mean latency, leak rate, budget used.
- CI uses the `mock` backend only. Real backends are run locally for review.

## Done means
Tests and build pass; the replay eval passes with mock minds; a real local run with 5 minds for at least 30 simulated
minutes is committed as an iteration with its log, isolation check result, call counts and leak rate, and screenshots
showing thought bubbles. Commit every iteration per AGENTS.md. Never push.
