# Build eval: 10/10 loads passed

Modes auto, webgl2; seeds 1, 7, 42, 99, 2026; 1 loads each. Timing reported only (software rendering).

| mode | seed | run | result | renderer | agents | start ms | median frame ms | blue | land | black | flat |
|---|---|---|---|---|---|---|---|---|---|---|---|
| auto | 1 | 1 | pass | WebGL2 (Enter) | 20 | 11636 | 1400 | 92% | 7% | 0% | 7% |
| auto | 7 | 1 | pass | WebGL2 (Enter) | 20 | 16432 | 3499.9 | 92% | 7% | 0% | 8% |
| auto | 42 | 1 | pass | WebGL2 (Enter) | 20 | 11360 | 1433.3 | 87% | 11% | 0% | 6% |
| auto | 99 | 1 | pass | WebGL2 (Enter) | 20 | 11693 | 1500 | 91% | 8% | 0% | 8% |
| auto | 2026 | 1 | pass | WebGL2 (Enter) | 20 | 12280 | 800 | 85% | 13% | 0% | 6% |
| webgl2 | 1 | 1 | pass | WebGL2 (Enter) | 20 | 10152 | 716.5 | 92% | 7% | 0% | 8% |
| webgl2 | 7 | 1 | pass | WebGL2 (Enter) | 20 | 10706 | 1550 | 92% | 7% | 0% | 8% |
| webgl2 | 42 | 1 | pass | WebGL2 (Enter) | 20 | 10755 | 1402.5 | 87% | 11% | 0% | 7% |
| webgl2 | 99 | 1 | pass | WebGL2 (Enter) | 20 | 10791 | 1483.4 | 92% | 7% | 0% | 8% |
| webgl2 | 2026 | 1 | pass | WebGL2 (Enter) | 20 | 10607 | 1499.9 | 85% | 13% | 0% | 7% |
