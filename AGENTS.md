# Island project workflow

## Owner rule: every iteration is a documented version

> New rule from the owner, effective now: every iteration is a documented version. After each screenshot check, commit immediately (even if not finished) with a message saying what you changed and what the screenshot showed, and copy that iteration's screenshots into docs/iterations/ (tracked, not gitignored) named <commit-step>-seed-N.png. Also add the screenshots you already took this run to docs/iterations/ in your next commit, in order. Never push; I push.

- After each screenshot check, commit the current code, its screenshots and a short iteration note immediately, including incomplete or failed results. Do this before making further code changes or starting the next iteration.
- The commit message must describe both the changes and the screenshot findings. Record remaining visual problems honestly.
- Track the images in `docs/iterations/` as `<commit-step>-seed-N.png`. Use increasing, zero-padded step identifiers and preserve capture order. For repeated seeds/backend variants, use a unique step suffix. Never overwrite a previous iteration’s images.
- Read `docs/iterations/README.md` and the existing filenames before allocating the next step.
- Keep commits local. Never push; the owner pushes.
