# Build eval: 10/10 loads passed

Modes auto, webgl2; seeds 1, 7, 42, 99, 2026; 1 loads each. Timing reported only (software rendering).

| mode | seed | run | result | renderer | agents | start ms | median frame ms | blue | land | black | flat |
|---|---|---|---|---|---|---|---|---|---|---|---|
| auto | 1 | 1 | pass | WebGL2 (Enter) | 20 | 10548 | 1333.2 | 92% | 7% | 0% | 8% |
| auto | 7 | 1 | pass | WebGL2 (Enter) | 20 | 11183 | 783.3 | 92% | 7% | 0% | 8% |
| auto | 42 | 1 | pass | WebGL2 (Enter) | 20 | 11379 | 1399.9 | 87% | 11% | 0% | 7% |
| auto | 99 | 1 | pass | WebGL2 (Enter) | 20 | 11139 | 733.3 | 91% | 8% | 0% | 8% |
| auto | 2026 | 1 | pass | WebGL2 (Enter) | 20 | 11189 | 1483.3 | 85% | 13% | 0% | 7% |
| webgl2 | 1 | 1 | pass | WebGL2 (Enter) | 20 | 9290 | 1383.4 | 92% | 7% | 0% | 8% |
| webgl2 | 7 | 1 | pass | WebGL2 (Enter) | 20 | 10361 | 1498.9 | 92% | 7% | 0% | 8% |
| webgl2 | 42 | 1 | pass | WebGL2 (Enter) | 20 | 10111 | 1449.9 | 87% | 11% | 0% | 7% |
| webgl2 | 99 | 1 | pass | WebGL2 (Enter) | 20 | 11077 | 1516.6 | 91% | 8% | 0% | 8% |
| webgl2 | 2026 | 1 | pass | WebGL2 (Enter) | 20 | 10913 | 1466.7 | 85% | 13% | 0% | 6% |
