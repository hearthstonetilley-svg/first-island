# Review 3 verification

Implemented against BRIEF.md, BRIEF-1.5.md and REVIEW-3.md. Local only.

## Images inspected before commit

All five final 1280×800 screenshots were opened and visually inspected. Both HUD labels are visible. The images are local, under gitignored `shots/`.

| Screenshot | Observed shape | Peak elevation | Trees / palms |
| --- | --- | ---: | ---: |
| [Seed 1](shots/review3-seed-1.png) | Long two-lobed island with a low sandy connection and a dominant rear peak | 11.38 | 299 / 16 |
| [Seed 42](shots/review3-seed-42.png) | Broad foreground mountain, rear headland and recessed western shore | 10.04 | 331 / 46 |
| [Seed 7](shots/review3-seed-7.png) | Crescent around an open bay, with a broken ridge behind it | 9.69 | 483 / 42 |
| [Seed 99](shots/review3-seed-99.png) | Main island with a separate small offshore islet | 10.76 | 422 / 29 |
| [Forced WebGL2, seed 1](shots/review3-seed-1-webgl2.png) | Same land and vegetation as seed 1; moving foam and reflection patterns differ | 11.38 | 299 / 16 |

## Checks against each review point

These checks were applied to every image above, including the forced WebGL2 image.

1. **Relief:** every island has a dominant rocky peak/ridge above green shoulders, lowlands and coastal groves. No flat green disc or raised enclosing sand rim. The beach is confined to the waterline. Seed 7 shows the clearest valley between uplands; seed 42 the strongest mountain relief.
2. **Silhouettes:** seed 1's linked lobes, seed 42's foreground mass, seed 7's open crescent and seed 99's offshore islet are visibly distinct. Each of the 2–4 blobs has seeded centre/radius/elongation variation, with domain-warped smooth unions. Land-mask symmetric difference divided by union is **37.1% (1/42), 64.3% (1/7), 70.9% (42/7)**; all exceed 25%.
3. **Seabed:** no rectangular shelf, dark square or hard underwater mesh boundary visible in any final image. A submerged outer mesh ring continues offshore. Per-fragment depth absorption makes deep water opaque; only the shallow sand remains visible.
4. **Trees:** trunks read brown, palms stay coastal and sparse, broadleaf groves occupy lowlands, pines occupy upper green slopes. Trees are smaller, with per-instance colour, size, yaw and lean variation. Broadleaf crowns have irregular lobes; pines have tiered crowns; palms have curved fronds. Open grass separates groves. These remain deliberately simple procedural trees, rather than photographic vegetation.
5. **Water:** blue offshore water, turquoise shallows, a bright narrow coastal foam line and a broken sun reflection are visible in all five. Foreground wave normals break up the glints; no grey fog sheet. Foam and glint positions visibly differ between the seed 1 captures. The height texture is sampled in the fragment shader rather than sparsely on the ocean's vertices.
6. **Sky/light:** blue gradient with a visible sun disc and soft warm glow, warm lit ridge faces and cooler shaded faces. The same sun vector drives sky, glints and directional light. Haze is concentrated at the distant horizon.
7. **Camera:** low starting view, horizon near y=290 of 800, land spanning roughly 60–70% of the image width. The camera fits actual land bounds, including seed 99's islet. Orbit and zoom handlers remain present.
8. **Post:** restrained HDR bloom on sun/highlights and half-resolution GTAO contact shading, eight samples, mixed at 35%. Neither washes out the coast or turns trunks black in the inspected images. No extra runtime dependencies were added.

## Automated checks

- `npm run build`: TypeScript and Vite production build pass. Vite reports the existing large-bundle advisory for the Three.js bundle.
- `npm test`: seven tests pass. Coverage includes deterministic heights/trees, different seeds, seed zero, URL parsing, submerged borders, the required pairwise land-mask regression, relief, tree elevation, slope, scale and species habitat.
- `git diff --check`: passes.

## Capture and verification limits

The installed headless Chromium uses SwiftShader, not the desktop GPU. Default renderer selection fell back to WebGL2. The separate `?renderer=webgl2` image exercises explicit backend selection. Native WebGPU probes could not produce a usable displayed frame in this environment (including a Chromium shared-image backing failure); those blank captures were rejected. **Native WebGPU rendering and desktop 60 fps are not verified.** TSL node materials and Three.js's built-in WebGPU-to-WebGL2 fallback are retained; there is no custom GLSL or racing renderer-initialization timeout.

Some virtual-time captures ended during asynchronous adapter startup. Final default-path captures disable unavailable WebGPU browser features, letting the application's built-in fallback initialize before the capture budget expires:

```sh
for seed in 1 42 7 99; do
  ~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
    --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader \
    --enable-unsafe-swiftshader --disable-features=WebGPU,WebGPUService \
    --window-size=1280,800 --virtual-time-budget=6000 \
    --screenshot="shots/review3-seed-${seed}.png" \
    "http://localhost:5173/?seed=${seed}"
done
```

The forced WebGL2 capture uses the same command without `--disable-features`, at `http://localhost:5173/?seed=1&renderer=webgl2`. Software-GPU FPS values in these images are not desktop performance measurements.
