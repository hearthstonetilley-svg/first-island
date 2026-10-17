# Milestone 1.5: visual quality pass + FPS counter

The owner's verdict on 0.1: works, but looks basic. Target: the polished look of current high-end Three.js WebGPU
showcases (stylised-realistic, not cartoon flat). Keep world generation in src/world pure; this is a render pass.

## Must have
1. FPS COUNTER, top right: current fps (smoothed) and frame time in ms. Small, readable, does not block the view.
2. WATER: real ocean shading in TSL (no GLSL):
   - several summed Gerstner or sine waves displacing the surface, visibly moving
   - Fresnel: more sky reflection at grazing angles, see-through and turquoise near shore, deep blue offshore
   - shoreline foam where water meets the beach (use the heightmap/depth to the seabed)
   - sun specular glints
3. SKY AND LIGHT: a proper sky with a sun (three's Sky / SkyMesh or a TSL gradient sky), sun direction shared with the
   directional light, soft shadows from trees and hills, ACES filmic tone mapping, gentle atmospheric haze to the horizon.
4. TERRAIN: higher resolution mesh, smooth normals, colour by height AND slope (wet sand at the waterline, dry sand,
   grass with subtle variation, rock on steep slopes), no visible square slab under the water (the seabed should fade
   naturally into deep water).
5. TREES: far fewer, clustered into groves with open meadows between; 2 or 3 shapes (pine, round broadleaf, palm near
   the beach); colour and size variation; gentle wind sway in the vertex shader.
6. SEEDS MUST DIFFER: seeds 1, 42 and 7 must give clearly different island silhouettes.
7. Still runs smoothly: aim for 60 fps on a normal desktop GPU. Show the fps counter in your screenshots.

## Verify before commit
Screenshots of seeds 1, 42, 7 and one with ?renderer=webgl2 using the headless chrome command in REVIEW-2.md,
saved under shots/ (gitignored). Look at them critically against this brief. Build and tests pass. Commit locally. No remote.
