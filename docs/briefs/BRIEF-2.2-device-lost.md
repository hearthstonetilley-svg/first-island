# Brief 2.2: survive a lost WebGPU device

Found by the build eval (`npm run eval`, see docs/reviews/v0.3.0.md): in headless Chromium with WebGPU enabled, the
WebGPU device is lost right after start-up ("Device was destroyed"), and the island stops with "The island could not
start". On real hardware a device can be lost at any time (driver reset, sleep, memory pressure).

1. Find out why the device is destroyed at start-up in this environment (it may be our own code disposing something
   that shares the device, for example during warm-up or the quality fallback). Fix it if it is ours.
2. Whatever the cause, handle device loss: listen for it, and rebuild the scene on a fresh WebGL2 renderer from the
   same world data, without a page reload, showing a short notice. A loss during start-up falls back the same way.
3. The label and FPS counter must never claim a renderer that is not drawing.
4. Done means `npm run eval` passes in BOTH modes (auto and webgl2), every seed, every run. Run it yourself: it is in
   package.json. Commit each iteration per AGENTS.md. Never push.
