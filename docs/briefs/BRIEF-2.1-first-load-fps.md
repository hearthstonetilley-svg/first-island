# Brief 2.1: huge FPS drop on first load (owner report, real hardware)

The owner sees a huge FPS drop on the first load in their real browser. Find the cause with measurements, then fix it.

1. Measure first. Add `?debug=1`: log frame times for the first 600 frames plus the time to first frame, and print a
   short summary (worst frame, frames over 50 ms, when frame time settles). Keep it in the code; it is useful later.
2. Likely causes, check each with the measurement:
   - shader/pipeline compilation on first use (WebGPU and WebGL2): precompile with `renderer.compileAsync(scene, camera)`
     (and for the post-processing chain) before the first visible frame, and keep the loading label up until it is done
   - post-processing cost (AO + bloom): measure with them off via `?post=0`
   - shadow map size, pixel ratio, terrain and tree instance counts
3. The first visible frame must already be smooth. If something is still heavy on first load, defer it (e.g. fade in
   AO after warm-up) rather than stall.
4. Add a quality fallback: if the median frame time over the first 2 s after warm-up is above 25 ms, step down
   automatically (pixel ratio, then AO off), and show the current quality level next to the fps counter.

Commit each iteration with notes in docs/iterations per AGENTS.md. Never push.

## Owner addition: staged loading screen

Show a proper loading screen and progress bar during world generation and shader precompilation, with steps such as
terrain generation, tree placement, water compilation, post-processing compilation and warm-up. Fade into the island
only once it runs smoothly. This is part of the same job; continue the documented screenshot iterations and never push.
