import {
  ACESFilmicToneMapping, BackSide, Color as ThreeColor,
  DataTexture, DirectionalLight, Float32BufferAttribute, FloatType, FogExp2,
  HemisphereLight, InstancedMesh, LinearFilter, Mesh, PerspectiveCamera, PlaneGeometry,
  RedFormat, Scene, SphereGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, Node, PostProcessing, WebGPURenderer } from 'three/webgpu';
import {
  attribute, cameraPosition, color, cos, dot, exp, float, max, mix, mrt, mx_noise_float, normalView, normalize, output,
  pass, positionLocal, positionWorld, pow, ShaderNodeObject, sin, smoothstep, texture, uniform, vec3,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { sampleHeight, sampleSlope, WorldData } from '../world/generate';
import { initializeRenderer } from './startup';
import { DeviceWatch } from './device';
import { TreeFigures } from './trees';
import { FrameDiagnostics } from './diagnostics';
import { QualityChange } from './quality';
import { warmRenderer } from './warmup';
import { Snapshot } from '../sim/types';
import { AgentFigures } from './agents';
import { StructureData, Structures } from './structures';
import { LoadingProgress, paintLoading } from '../ui/loading';

const SUN_DIRECTION = new Vector3(-0.82, 0.22, -0.53).normalize();

function addTerrain(scene: Scene, world: WorldData): void {
  // An extra submerged ring continues the seabed out past the view, with no square shelf.
  const count = world.resolution + 2;
  const geometry = new PlaneGeometry(world.size, world.size, count - 1, count - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const wetSand = new ThreeColor('#988664');
  const drySand = new ThreeColor('#dfce9c');
  const grass = new ThreeColor('#67884b');
  const shade = new ThreeColor();
  const rockWeights = new Float32Array(positions.count);
  const cavities = new Float32Array(positions.count);
  const heightAt = (row: number, column: number) => world.heights[
    Math.max(0, Math.min(world.resolution - 1, row)) * world.resolution
    + Math.max(0, Math.min(world.resolution - 1, column))
  ];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      const index = row * count + column;
      const r = Math.max(0, Math.min(world.resolution - 1, row - 1));
      const c = Math.max(0, Math.min(world.resolution - 1, column - 1));
      const x = (c / (world.resolution - 1) - 0.5) * world.size;
      const z = (r / (world.resolution - 1) - 0.5) * world.size;
      const outer = row === 0 || column === 0 || row === count - 1 || column === count - 1;
      const height = world.heights[r * world.resolution + c];
      positions.setXYZ(index, column === 0 ? -600 : column === count - 1 ? 600 : x,
        outer ? -180 : height, row === 0 ? -600 : row === count - 1 ? 600 : z);
      const slope = sampleSlope(world, x, z);
      shade.copy(wetSand).lerp(drySand, smooth(0.01, 0.17, height));
      shade.lerp(grass, smooth(0.16, 0.38, height));
      const variation = Math.sin(x * 1.7 + Math.sin(z * 2.3)) * Math.cos(z * 1.4 - x * 0.6);
      shade.offsetHSL(variation * 0.018, 0, variation * 0.035);
      rockWeights[index] = Math.max(smooth(1.45, 2.4, slope), smooth(5.6, 9, height) * 0.9);
      // Positive curvature identifies actual hollows in the existing heightmap.
      // Two radii pick up narrow fissures and the larger erosion channels.
      const meanAt = (radius: number) => (heightAt(r - radius, c) + heightAt(r + radius, c)
        + heightAt(r, c - radius) + heightAt(r, c + radius)) * 0.25;
      cavities[index] = smooth(0.05, 0.9, Math.max(0, (meanAt(2) - height) * 2 + (meanAt(4) - height) * 0.3));
      colors.set([shade.r, shade.g, shade.b], index * 3);
    }
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('rockWeight', new Float32BufferAttribute(rockWeights, 1));
  geometry.setAttribute('cavity', new Float32BufferAttribute(cavities, 1));
  geometry.computeVertexNormals();
  const material = new MeshStandardNodeMaterial({ roughness: 0.95 });
  const grain = sin(positionWorld.x.mul(6.3).add(sin(positionWorld.z.mul(4.7))))
    .mul(sin(positionWorld.z.mul(7.1).add(positionWorld.y.mul(9.3))));
  const minerals = mx_noise_float(positionWorld.mul(0.55)).mul(0.5).add(0.5);
  const flecks = mx_noise_float(positionWorld.mul(3.1)).mul(0.5).add(0.5);
  const stone = mix(color('#4f6267'), color('#8b806c'), smoothstep(0.2, 0.8, minerals));
  const weathered = mix(stone, color('#a39779'), flecks.mul(0.2));
  const creviceShade = mix(float(1), float(0.42), attribute('cavity', 'float'));
  const surface = mix(attribute('color', 'vec3'), weathered.mul(creviceShade), attribute('rockWeight', 'float'));
  material.colorNode = surface.mul(grain.mul(0.045).add(1));
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function smooth(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function addOcean(scene: Scene, world: WorldData): { time: ReturnType<typeof uniform>; mesh: Mesh; heightTexture: DataTexture } {
  const geometry = new PlaneGeometry(2, 2, 224, 224);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  // Concentrate wave vertices near the island; the horizon needs far fewer.
  const spread = (t: number) => Math.sinh(t * Math.asinh(600 / 9)) * 9;
  for (let i = 0; i < pos.count; i += 1) pos.setXYZ(i, spread(pos.getX(i)), 0, spread(pos.getZ(i)));
  geometry.computeBoundingSphere();
  const heightTexture = new DataTexture(world.heights, world.resolution, world.resolution, RedFormat, FloatType);
  heightTexture.minFilter = LinearFilter;
  heightTexture.magFilter = LinearFilter;
  heightTexture.needsUpdate = true;
  const time = uniform(0);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: true });
  // Vertex displacement and analytic fragment normals use the same wave spectrum.
  const waves = [
    { x: 0.85, z: 0.32, amplitude: 0.075, speed: 1.1 },
    { x: -0.42, z: 1.45, amplitude: 0.045, speed: 1.45 },
    { x: 2.6, z: 1.8, amplitude: 0.018, speed: 2.1 },
    { x: -5.8, z: 3.2, amplitude: 0.008, speed: 2.8 },
  ];
  let displacement: ShaderNodeObject<Node> = float(0);
  let dx: ShaderNodeObject<Node> = float(0);
  let dz: ShaderNodeObject<Node> = float(0);
  for (const wave of waves) {
    const vertexPhase = positionLocal.x.mul(wave.x).add(positionLocal.z.mul(wave.z)).add(time.mul(wave.speed));
    displacement = displacement.add(sin(vertexPhase).mul(wave.amplitude));
    const phase = positionWorld.x.mul(wave.x).add(positionWorld.z.mul(wave.z)).add(time.mul(wave.speed));
    dx = dx.add(cos(phase).mul(wave.amplitude * wave.x));
    dz = dz.add(cos(phase).mul(wave.amplitude * wave.z));
  }
  material.positionNode = positionLocal.add(vec3(0, displacement, 0));
  const waterNormal = normalize(vec3(dx.negate(), 1, dz.negate()));
  const view = normalize(cameraPosition.sub(positionWorld));
  const uv = positionWorld.xz.div(world.size).add(0.5)
    .mul((world.resolution - 1) / world.resolution).add(0.5 / world.resolution);
  const ground = texture(heightTexture, uv).r;
  const depth = max(positionWorld.y.sub(ground), float(0));
  const fresnel = pow(float(1).sub(max(dot(waterNormal, view), float(0))), float(5));
  const depthColor = mix(color('#37cbb7'), color('#07516c'), smoothstep(0.25, 4.5, depth));
  const deepColor = mix(depthColor, color('#07314f'), smoothstep(4, 14, depth));
  const reflection = mix(color('#397da8'), color('#89b8cf'), fresnel);
  const reflected = mix(deepColor, reflection, fresnel.mul(0.65).add(0.06));
  const halfVector = normalize(vec3(SUN_DIRECTION).add(view));
  const highlight = pow(max(dot(waterNormal, halfVector), float(0)), float(1200));
  const broadHighlight = pow(max(dot(waterNormal, halfVector), float(0)), float(120)).mul(0.012);
  const glints = color('#fff1ce').mul(highlight.mul(0.75).add(broadHighlight));
  // Depth is sampled per fragment, not interpolated across a huge ocean triangle.
  const shore = float(1).sub(smoothstep(0.06, 0.42, depth));
  const breaker = sin(depth.mul(15).sub(time.mul(2.4)).add(sin(positionWorld.x.mul(8)).mul(0.45)))
    .mul(0.5).add(0.5);
  const foam = shore.mul(smoothstep(0.35, 0.78, breaker)).mul(0.82);
  material.colorNode = mix(reflected.add(glints), color('#f3fff1'), foam);
  // Beer-Lambert absorption: sand remains visible only in the shallow water.
  material.opacityNode = max(float(1).sub(exp(depth.mul(-2.5))), float(0.55)).add(foam).clamp(0, 1);
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { time, mesh, heightTexture };
}

function addSky(scene: Scene): void {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  const direction = normalize(positionWorld.sub(cameraPosition));
  const gradient = smoothstep(0, 0.32, direction.y);
  const sky = mix(color('#83bddc'), color('#1054b9'), gradient);
  const sunAngle = dot(direction, vec3(SUN_DIRECTION));
  const glow = pow(max(sunAngle, float(0)), float(200)).mul(0.5);
  const disc = smoothstep(0.99984, 0.99992, sunAngle).mul(7);
  material.colorNode = sky.add(color('#ffdca2').mul(glow.add(disc)));
  scene.add(new Mesh(new SphereGeometry(900, 48, 24), material));
}

interface SceneOptions {
  snapshot?: Snapshot;
  /** Called when the owner takes the camera by hand (drag or wheel), ending any follow. */
  onManualCamera?: () => void;
  figureScale?: number;
  agentColours?: string[];
  onSelect?: (id: number) => void;
  postEnabled?: boolean;
  diagnostics?: FrameDiagnostics;
  onProgress?: (progress: LoadingProgress) => Promise<void>;
  shadowMapSize?: number;
  pixelRatio?: number;
  onFallback?: () => void;
}

export interface IslandScene {
  renderer: WebGPURenderer;
  label: string;
  render(time: number): void;
  resize(): void;
  setQuality(change: QualityChange): void;
  updateSnapshot(snapshot: Snapshot, timestamp: number): void;
  selectAgent(id: number | undefined): void;
  followAgent(id: number | undefined): void;
  /** Whole island; pitch and fill let a page with side panels frame it to its free space. */
  islandView(pitch?: number, fill?: number): void;
  agentPositions(): ReturnType<AgentFigures['projected']>;
  addStructure(structure: StructureData): void;
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
  /** Free camera: move along the ground relative to the view, turn, and zoom. */
  move(forward: number, right: number): void;
  turn(radians: number): void;
  zoom(factor: number): void;
  cameraInfo(): { y: number; ground: number; tx: number; tz: number; yaw: number; pitch: number; distance: number };
  /** Stop any follow or glide: the camera stays exactly where it is. */
  cancelAutomaticCamera(): void;
  /** The full camera pose, to carry across a graphics recovery. */
  getPose(): { tx: number; ty: number; tz: number; yaw: number; pitch: number; distance: number };
  setPose(pose: { tx: number; ty: number; tz: number; yaw: number; pitch: number; distance: number }): void;
  /** Ease the camera to frame these agents (all agents when omitted). */
  frameAgents(ids?: number[]): void;
  /** Keep the scene's centre clear of a panel this many pixels wide on the left (and right). */
  setInsets(left: number, right: number): void;
  waitForGPU(): Promise<void>;
  onLost(listener: () => void): () => void;
  dispose(): void;
}

export async function createIslandScene(canvas: HTMLCanvasElement, world: WorldData, forceWebGL2 = false,
  options: SceneOptions = {}): Promise<IslandScene> {
  await options.onProgress?.({ stage: 'renderer', message: 'Starting the renderer', percent: 40 });
  const rendererStarted = performance.now();
  const candidate = await initializeRenderer((forceWebGL) => {
    const renderer = new WebGPURenderer({ canvas: canvas.cloneNode(false) as HTMLCanvasElement,
      antialias: true, forceWebGL });
    const watch = new DeviceWatch();
    let initialized: Promise<unknown> | undefined;
    let disposed = false;
    renderer.onDeviceLost = (info) => {
      if (disposed) return;
      watch.notify(info);
      if (info.api === 'WebGPU') options.onFallback?.();
    };
    return { renderer, watch,
      init: () => { initialized = renderer.init(); return watch.run(() => initialized!); },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        watch.retire();
        // Do not release a renderer while its own init is still allocating.
        const release = () => { try { renderer.dispose(); } catch { /* Partially initialized backend. */ } };
        void (initialized ?? Promise.resolve()).then(release, release);
      },
    };
  }, forceWebGL2);
  options.diagnostics?.phase('rendererInit', performance.now() - rendererStarted);
  let cleanup = () => candidate.dispose();
  const building = buildIslandScene(canvas, world, candidate.renderer, candidate.watch, candidate.dispose,
    (dispose) => { cleanup = dispose; }, options);
  try { return await candidate.watch.run(() => building); }
  catch (error) {
    candidate.watch.retire();
    // Any abandoned async continuation sees the retired watch before it can draw
    // or publish progress into the replacement scene.
    void building.then((scene) => scene.dispose(), () => cleanup());
    throw error;
  }
}

async function buildIslandScene(placeholder: HTMLCanvasElement, world: WorldData, renderer: WebGPURenderer,
  watch: DeviceWatch, releaseRenderer: () => void, setCleanup: (dispose: () => void) => void,
  options: SceneOptions): Promise<IslandScene> {
  const progress = async (step: LoadingProgress) => {
    watch.assert();
    await options.onProgress?.(step);
    watch.assert();
  };
  const buildStarted = performance.now();
  const canvas = renderer.domElement;
  canvas.style.visibility = 'hidden';
  placeholder.replaceWith(canvas);
  const scene = new Scene();
  const disposables: Array<{ dispose(): void }> = [];
  const events = new AbortController();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    events.abort();
    watch.retire();
    const geometries = new Set<PlaneGeometry>();
    const materials = new Set<MeshBasicNodeMaterial>();
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry as PlaneGeometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material as MeshBasicNodeMaterial);
      }
    });
    // A lost backend may reject resource destruction. Always finish releasing
    // this scene; cleanup of a dead device must not block a fresh renderer.
    for (const resource of [...geometries, ...materials, ...disposables]) {
      try { resource.dispose(); } catch { /* The device no longer owns live resources. */ }
    }
    releaseRenderer();
  };
  setCleanup(dispose);
  scene.background = new ThreeColor('#a6cedf');
  scene.fog = new FogExp2('#9bc5d9', 0.0018);
  const camera = new PerspectiveCamera(46, innerWidth / innerHeight, 0.15, 1600);
  const land: Vector3[] = [];
  const minLand = new Vector3(Infinity, Infinity, Infinity);
  const maxLand = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let row = 0; row < world.resolution; row += 1) {
    for (let column = 0; column < world.resolution; column += 1) {
      const height = world.heights[row * world.resolution + column];
      if (height <= 0) continue;
      const point = new Vector3((column / (world.resolution - 1) - 0.5) * world.size,
        height, (row / (world.resolution - 1) - 0.5) * world.size);
      land.push(point);
      minLand.min(point);
      maxLand.max(point);
    }
  }
  const target = minLand.clone().add(maxLand).multiplyScalar(0.5);
  target.y = 2.7;
  let orbitYaw = 0.58;
  let orbitPitch = 0.13;
  // Fit the actual land, including an offshore islet, rather than the square map.
  // A low pitch puts the horizon near the upper third at the default aspect ratio.
  const right = new Vector3(Math.cos(orbitYaw), 0, -Math.sin(orbitYaw));
  const toCamera = new Vector3(Math.sin(orbitYaw) * Math.cos(orbitPitch),
    Math.sin(orbitPitch), Math.cos(orbitYaw) * Math.cos(orbitPitch));
  const tanFov = Math.tan(camera.fov * Math.PI / 360);
  let distance = 15;
  for (const point of land) {
    const offset = point.sub(target);
    distance = Math.max(distance, offset.dot(toCamera) + Math.abs(offset.dot(right)) / (tanFov * camera.aspect * 0.62));
  }
  const islandTarget = target.clone();
  const islandDistance = distance;
  let followed: number | undefined;
  let downX = 0, downY = 0, moved = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const updateCamera = () => {
    orbitPitch = Math.max(0.035, Math.min(1.25, orbitPitch));
    distance = Math.max(options.figureScale ? 5 : 15, Math.min(world.size * 2, distance));
    camera.position.set(target.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * distance,
      target.y + Math.sin(orbitPitch) * distance, target.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * distance);
    // The free camera never sinks into the land: lift the view above the ground under it.
    const under = Math.max(0, sampleHeight(world, camera.position.x, camera.position.z));
    if (camera.position.y < under + 1.2) camera.position.y = under + 1.2;
    camera.lookAt(target);
  };
  updateCamera();
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    downX = event.clientX; downY = event.clientY; moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }, { signal: events.signal });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    moved ||= Math.hypot(event.clientX - downX, event.clientY - downY) > 4;
    if (moved) manualCamera();
    orbitYaw -= (event.clientX - lastX) * 0.008;
    orbitPitch += (event.clientY - lastY) * 0.006;
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  }, { signal: events.signal });
  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    if (!moved) { const id = figures.pick(event.clientX, event.clientY, canvas, camera); if (id !== undefined) options.onSelect?.(id); }
  }, { signal: events.signal });
  canvas.addEventListener('pointercancel', () => { dragging = false; }, { signal: events.signal });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    manualCamera();
    distance *= Math.exp(event.deltaY * 0.001);
    updateCamera();
  }, { passive: false, signal: events.signal });

  await progress({ stage: 'terrain', message: 'Building terrain and coastlines', percent: 46 });
  addSky(scene);
  addTerrain(scene, world);
  await progress({ stage: 'trees', message: 'Building forest canopies', percent: 51 });
  const treeTime = uniform(0);
  const trees = new TreeFigures(scene, treeTime, options.snapshot);
  disposables.push(trees);
  await progress({ stage: 'water', message: 'Preparing the ocean', percent: 56 });
  const figures = new AgentFigures(scene, options.snapshot);
  disposables.push(figures);
  const ocean = addOcean(scene, world);
  disposables.push(ocean.heightTexture);
  scene.add(new HemisphereLight('#c5defc', '#73654b', 3));
  const sun = new DirectionalLight('#ffe1a6', 3.2);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(options.shadowMapSize ?? 2048, options.shadowMapSize ?? 2048);
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.035;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 180;
  scene.add(sun);
  disposables.push(sun.shadow);

  const label = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend ? 'WebGL2' : 'WebGPU';
  renderer.setPixelRatio(options.pixelRatio ?? Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;

  options.diagnostics?.phase('sceneBuild', performance.now() - buildStarted);
  let draw: () => void = () => { renderer.render(scene, camera); };
  let drawWithoutAO = draw;
  let compileScene = () => renderer.compileAsync(scene, camera);
  let compileWater = () => renderer.compileAsync(ocean.mesh, camera, scene);

  if (options.postEnabled !== false) {
    const post = new PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    scenePass.setMRT(mrt({ output, normal: normalView }));
    const sceneColor = scenePass.getTextureNode('output');
    const occlusion = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
    occlusion.resolutionScale = 0.5;
    occlusion.samples.value = 8;
    occlusion.radius.value = 0.55;
    occlusion.thickness.value = 1;
    // Gentle contact shading; HDR bloom is restricted to sun and water highlights.
    const shaded = sceneColor.mul(mix(float(1), occlusion.getTextureNode().r, float(0.35)));
    const glow = bloom(sceneColor, 0.16, 0.4, 1.5);
    post.outputNode = shaded.add(glow);
    const withoutAO = new PostProcessing(renderer);
    disposables.push(post, withoutAO, scenePass, occlusion, glow);
    // Share scene and bloom nodes; bypass GTAO entirely in the low quality graph.
    withoutAO.outputNode = sceneColor.add(glow);
    draw = () => post.render();
    drawWithoutAO = () => withoutAO.render();
    // PassNode compiles the scene against its MRT target via renderer.compileAsync.
    compileScene = () => scenePass.compileAsync(renderer);
    compileWater = async () => {
      const target = renderer.getRenderTarget();
      const activeMRT = renderer.getMRT();
      renderer.setRenderTarget(scenePass.renderTarget);
      renderer.setMRT(scenePass.getMRT());
      try { await renderer.compileAsync(ocean.mesh, camera, scene); }
      finally { renderer.setRenderTarget(target); renderer.setMRT(activeMRT); }
    };
  }
  if (options.diagnostics) {
    let meshes = 0;
    let triangles = 0;
    let treeDrawMeshes = 0;
    let agentDrawMeshes = 0;
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      meshes += 1;
      const count = object instanceof InstancedMesh ? object.count : 1;
      if (object instanceof InstancedMesh) {
        if (object.userData.agentFigure) agentDrawMeshes += 1;
        else if (!object.userData.foodFigure) treeDrawMeshes += 1;
      }
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * count;
    });
    options.diagnostics.report.scene = {
      backend: label, viewport: [innerWidth, innerHeight], pixelRatio: renderer.getPixelRatio(), initialPixelRatio: renderer.getPixelRatio(),
      shadowMap: [sun.shadow.mapSize.x, sun.shadow.mapSize.y], meshes, triangles, treeDrawMeshes, agentDrawMeshes, initialAgentInstances: options.snapshot?.agents.length ?? 0,
      trees: options.snapshot?.trees.length ?? 0, terrainVertices: (world.resolution + 2) ** 2, oceanVertices: 225 ** 2,
      postEnabled: options.postEnabled !== false, ao: options.postEnabled !== false, bloom: options.postEnabled !== false,
    };
  }
  let warmupStarted = 0;
  await watch.run(() => warmRenderer({
    compile: async (isExpired) => {
      await progress({ stage: 'water', message: 'Compiling water', percent: 63 });
      if (isExpired()) return;
      const waterCompileStarted = performance.now();
      await compileWater();
      if (isExpired()) return;
      options.diagnostics?.phase('waterCompile', performance.now() - waterCompileStarted);
      await progress({ stage: 'post', message: 'Compiling terrain and lighting', percent: 70 });
      if (isExpired()) return;
      const compileStarted = performance.now();
      await compileScene();
      if (isExpired()) return;
      options.diagnostics?.phase('sceneCompile', performance.now() - compileStarted);
      await progress({ stage: 'post', message: options.postEnabled !== false
        ? 'Compiling post-processing' : 'Preparing the final image', percent: 78 });
      if (isExpired()) return;
      warmupStarted = performance.now();
    },
    // PostProcessing has no public compileAsync. Hidden renders compile its full
    // graph, including shadows, AO, bloom and the output transform. Warm both
    // quality graphs, then fence the GPU before revealing the final high frame.
    draws: options.postEnabled !== false ? [drawWithoutAO, draw, draw] : [draw, draw],
    waitForGPU: async () => {
      await watch.run(() => renderer.waitForGPU());
      await progress({ stage: 'warmup', message: 'Warming up the island', percent: 86 });
    },
    dispose,
  }));
  options.diagnostics?.phase('renderWarmup', performance.now() - warmupStarted);
  canvas.style.visibility = 'visible';
  await paintLoading();

  const drawWithAO = draw;
  const setQuality = (change: QualityChange) => {
    watch.assert();
    renderer.setPixelRatio(change.pixelRatio);
    draw = change.aoEnabled ? drawWithAO : drawWithoutAO;
    if (options.diagnostics) Object.assign(options.diagnostics.report.scene, {
      pixelRatio: change.pixelRatio, ao: change.aoEnabled,
    });
  };

  const resize = () => {
    watch.assert();
    camera.aspect = innerWidth / innerHeight;
    applyInsets();
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
  let glide: { target: Vector3; distance: number; pitch: number } | undefined;
  // Any automatic movement (a follow or a glide) ends the moment the owner takes the camera.
  function cancelAutomatic() { followed = undefined; glide = undefined; lastGlide = 0; }
  function manualCamera() { if (followed !== undefined || glide) { cancelAutomatic(); options.onManualCamera?.(); } }
  let lastGlide = 0;
  let insets = { left: 0, right: 0 };
  const applyInsets = () => {
    if (!insets.left && !insets.right) { camera.clearViewOffset(); return; }
    camera.setViewOffset(innerWidth, innerHeight, (insets.right - insets.left) / 2, 0, innerWidth, innerHeight);
  };
  const render = (time: number) => {
    watch.assert();
    const agents = figures.update(performance.now(), time * 0.001);
    if (glide) {
      // Time-based easing: the same glide on a slow machine as on a fast one.
      const nowMs = performance.now(), k = 1 - Math.exp(-Math.min(1, (nowMs - (lastGlide || nowMs)) / 1000) * 4); lastGlide = nowMs;
      target.lerp(glide.target, k); distance += (glide.distance - distance) * k; orbitPitch += (glide.pitch - orbitPitch) * k;
      if (target.distanceTo(glide.target) < 0.05 && Math.abs(distance - glide.distance) < 0.05) { glide = undefined; lastGlide = 0; }
      updateCamera();
    }
    if (followed !== undefined) {
      const agent = agents.find(a => a.id === followed);
      if (agent) { target.lerp(new Vector3(agent.x, agent.y + 0.45, agent.z), 0.3); updateCamera(); }
      else followed = undefined;
    }
    treeTime.value = time * 0.001;
    ocean.time.value = time * 0.001;
    draw();
  };
  const structures = new Structures(scene);
  if (options.figureScale) figures.scale = options.figureScale;
  if (options.agentColours) figures.colours = options.agentColours;
  const limit = world.size / 2;
  return { renderer, label, render, resize, setQuality, dispose,
    addStructure: (structure) => structures.add(structure),
    frameAgents: (ids) => {
      const list = figures.update(performance.now(), 0).filter(a => !ids || ids.includes(a.id));
      if (!list.length) return;
      followed = undefined;
      const cx = list.reduce((n, a) => n + a.x, 0) / list.length, cz = list.reduce((n, a) => n + a.z, 0) / list.length;
      const cy = list.reduce((n, a) => n + a.y, 0) / list.length;
      const radius = Math.max(...list.map(a => Math.hypot(a.x - cx, a.z - cz)));
      glide = { target: new Vector3(cx, cy + 0.6, cz), distance: Math.max(9, radius * 2.4 + 8), pitch: 0.5 };
    },
    setInsets: (left, right) => { insets = { left, right }; applyInsets(); },
    move: (forward, right) => {
      cancelAutomatic();
      const step = Math.max(0.04, distance * 0.0045);
      target.x = Math.max(-limit, Math.min(limit, target.x - Math.sin(orbitYaw) * forward * step + Math.cos(orbitYaw) * right * step));
      target.z = Math.max(-limit, Math.min(limit, target.z - Math.cos(orbitYaw) * forward * step - Math.sin(orbitYaw) * right * step));
      // Glide over the land: the point the camera looks at rides on the terrain.
      target.y = Math.max(0, sampleHeight(world, target.x, target.z)) + 0.45;
      updateCamera();
    },
    turn: (radians) => { cancelAutomatic(); orbitYaw += radians; updateCamera(); },
    zoom: (factor) => { cancelAutomatic(); distance *= factor; updateCamera(); },
    cameraInfo: () => ({ y: camera.position.y, ground: Math.max(0, sampleHeight(world, camera.position.x, camera.position.z)), tx: target.x, tz: target.z, yaw: orbitYaw, pitch: orbitPitch, distance }),
    cancelAutomaticCamera: () => cancelAutomatic(),
    getPose: () => ({ tx: target.x, ty: target.y, tz: target.z, yaw: orbitYaw, pitch: orbitPitch, distance }),
    setPose: (pose) => { cancelAutomatic(); target.set(pose.tx, pose.ty, pose.tz); orbitYaw = pose.yaw; orbitPitch = pose.pitch; distance = pose.distance; updateCamera(); },
    project: (x, y, z) => { const p = new Vector3(x, y, z).project(camera);
      return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2, visible: p.z >= -1 && p.z <= 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 }; },
    updateSnapshot: (snapshot, timestamp) => { trees.receive(snapshot); figures.receive(snapshot, timestamp); },
    selectAgent: (id) => { figures.selected = id; },
    followAgent: (id) => { followed = id; glide = undefined; if (id !== undefined) { distance = 12; orbitPitch = 0.45; } },
    islandView: (pitch, fill) => {
      followed = undefined; glide = undefined;
      if (pitch === undefined) { target.copy(islandTarget); distance = islandDistance; orbitYaw = 0.58; orbitPitch = 0.13; updateCamera(); return; }
      // Ease to the whole island seen from higher up, scaled to the free part of the screen.
      glide = { target: islandTarget.clone(), distance: islandDistance * (fill ?? 1), pitch };
    },
    agentPositions: () => figures.projected(camera),
    waitForGPU: () => watch.run(() => renderer.waitForGPU()), onLost: (listener) => watch.subscribe(listener) };
}
