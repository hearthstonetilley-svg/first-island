# Iteration archive

Every screenshot check is a documented version. The owner’s rule is recorded in [AGENTS.md](../../AGENTS.md).

## Retrospective archive of the Review 3 run

This commit preserves all 21 PNG files retained in `shots/`, in capture order using their last-write timestamps. It includes the four pre-existing baseline images, the intermediate attempts, renderer diagnostics, and the five final screenshots. Files are byte-for-byte copies, including unsuccessful captures. The manifest records source names, timestamps, dimensions verified as 1280×800, byte counts and SHA-256 hashes.

These archive numbers identify retained captures, not 21 historical code commits. Intermediate source versions were not committed before the new rule. Reused screenshot filenames overwrote earlier captures; missing originals cannot be reconstructed. No historical code versions or screenshots have been fabricated. The five final captures show the code committed as `dd061d6`; their findings and rendering limits are recorded in [VERIFICATION.md](../../VERIFICATION.md).

| Step | Tracked image | Original name | Provenance |
| --- | --- | --- | --- |
| 001 | [001-seed-1.png](001-seed-1.png) | `shots/seed-1.png` | pre-existing baseline |
| 002 | [002-seed-42.png](002-seed-42.png) | `shots/seed-42.png` | pre-existing baseline |
| 003 | [003-seed-7.png](003-seed-7.png) | `shots/seed-7.png` | pre-existing baseline |
| 004 | [004-seed-1.png](004-seed-1.png) | `shots/seed-1-webgl2.png` | pre-existing baseline |
| 005 | [005-seed-1.png](005-seed-1.png) | `shots/review3-seed-1-b.png` | intermediate / diagnostic |
| 006 | [006-seed-1.png](006-seed-1.png) | `shots/review3-seed-1-c.png` | intermediate / diagnostic |
| 007 | [007-seed-42.png](007-seed-42.png) | `shots/review3-seed-42-d.png` | intermediate / diagnostic |
| 008 | [008-seed-42.png](008-seed-42.png) | `shots/review3-seed-42-e.png` | intermediate / diagnostic |
| 009 | [009-seed-42.png](009-seed-42.png) | `shots/review3-seed-42-f.png` | intermediate / diagnostic |
| 010 | [010-seed-1.png](010-seed-1.png) | `shots/review3-webgpu-probe.png` | intermediate / diagnostic |
| 011 | [011-seed-1.png](011-seed-1.png) | `shots/review3-webgpu-diagnostic.png` | intermediate / diagnostic |
| 012 | [012-seed-7.png](012-seed-7.png) | `shots/review3-seed-7-g.png` | intermediate / diagnostic |
| 013 | [013-seed-1.png](013-seed-1.png) | `shots/review3-webgpu-lvp.png` | intermediate / diagnostic |
| 014 | [014-seed-99.png](014-seed-99.png) | `shots/review3-seed-99-g.png` | intermediate / diagnostic |
| 015 | [015-seed-1.png](015-seed-1.png) | `shots/review3-webgpu-wait.png` | intermediate / diagnostic |
| 016 | [016-seed-7.png](016-seed-7.png) | `shots/review3-seed-7-h.png` | intermediate / diagnostic |
| 017 | [017-seed-1.png](017-seed-1.png) | `shots/review3-seed-1.png` | final dd061d6 |
| 018 | [018-seed-42.png](018-seed-42.png) | `shots/review3-seed-42.png` | final dd061d6 |
| 019 | [019-seed-7.png](019-seed-7.png) | `shots/review3-seed-7.png` | final dd061d6 |
| 020 | [020-seed-99.png](020-seed-99.png) | `shots/review3-seed-99.png` | final dd061d6 |
| 021 | [021-seed-1.png](021-seed-1.png) | `shots/review3-seed-1-webgl2.png` | final dd061d6 |

## Documented iterations

| Step | Scope and screenshot findings |
| --- | --- |
| [022](022.md) | Startup deadline and safe fallback only. All 12 normal loads show complete islands; forced WebGL2 succeeds; graphics-disabled capture shows a clear error. [Machine-readable results](022-startup.json). |
| [023](023.md) | Muted rock colours and terrain-derived crevices, softer/narrower glitter, three branched broadleaf crown families. Six inspected captures include five seeds and forced WebGL2. [Capture metadata](023-captures.json). |
| [024](024.md) | Brief 2.1: first-load diagnostics and baseline comparisons. |
| [025](025.md) | Brief 2.1: first-load diagnostics, hidden warm-up and adaptive quality. |
| [026](026.md) | Staged loading screen, real generation/compilation progress, GPU-fenced readiness and fade. Loading, mobile, failure and multi-seed captures. |

## Next iteration

Start with step `027`. Capture and inspect the screenshots, record what changed and what they show, and commit the code, note and images immediately, even if the result needs another fix. Complete that commit before starting another iteration. Multiple seeds from one code version can share a step prefix. Use a distinct step suffix for repeat captures of the same seed, such as `022-webgl2-seed-1.png`, and never overwrite earlier images. Never push; the owner pushes.
