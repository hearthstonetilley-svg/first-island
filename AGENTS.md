# Working rules for coding agents in this repo

This is a public research experiment. The build process is part of the record, so follow these rules exactly.

1. Work only from the current brief in `docs/briefs/` and the latest review in `docs/reviews/`.
2. Every iteration is a documented version. After each screenshot check, commit immediately, even if unfinished,
   with a message saying what changed and what the screenshot showed.
3. Save each iteration's screenshots to `docs/iterations/` (tracked) as `<step>-seed-<N>.png`, and add a
   `docs/iterations/<step>.md` note. Keep the step numbers continuous across sessions.
4. Verify visually before calling anything done: headless screenshots of several seeds plus `?renderer=webgl2`.
   Tests passing is not enough; this project has shipped passing tests with a broken picture before.
5. Never push, never add remotes, never open pull requests. The reviewer publishes every version through a pull request.
6. No secrets or personal details in the repo.
