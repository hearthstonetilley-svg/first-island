import {
  ACESFilmicToneMapping, BackSide, Color as ThreeColor, ConeGeometry, CylinderGeometry,
  DataTexture, DirectionalLight, DoubleSide, Euler, Float32BufferAttribute, FloatType, FogExp2,
  HemisphereLight, InstancedMesh, LinearFilter, Matrix4, Mesh, PerspectiveCamera, PlaneGeometry,
  Quaternion, RedFormat, Scene, SphereGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, Node, PostProcessing, WebGPURenderer } from 'three/webgpu';
import {
  cameraPosition, color, cos, dot, exp, float, max, mix, mrt, normalView, normalize, output,
  pass, positionLocal, positionWorld, pow, ShaderNodeObject, sin, smoothstep, texture, uniform, vec3,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { sampleSlope, TreeData, TreeKind, WorldData } from '../world/generate';
import { initializeRenderer } from './startup';

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
  const rock = new ThreeColor('#a6a196');
  const shade = new ThreeColor();
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
      const rocky = Math.max(smooth(1.45, 2.4, slope), smooth(4.8, 7, height) * 0.9);
      shade.lerp(rock, rocky);
      // Fine strata and erosion variation stay continuous across triangle boundaries.
      const strata = Math.sin(height * 16 + x * 0.8 + Math.sin(z * 3)) * 0.025 * rocky;
      shade.multiplyScalar(1 + strata);
      colors.set([shade.r, shade.g, shade.b], index * 3);
    }
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 });
  const grain = sin(positionWorld.x.mul(6.3).add(sin(positionWorld.z.mul(4.7))))
    .mul(sin(positionWorld.z.mul(7.1).add(positionWorld.y.mul(9.3))));
  material.colorNode = color('white').mul(grain.mul(0.045).add(1));
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function smooth(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function treeMaterial(time: ReturnType<typeof uniform>): MeshStandardNodeMaterial {
  // Instance colours already contain the bark/leaf hue. A second dark base colour
  // would multiply it again and turn the trunks almost black.
  const material = new MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.92 });
  const bend = max(positionLocal.y, float(0)).pow(2).mul(0.012);
  material.positionNode = positionLocal.add(vec3(
    sin(time.mul(1.2).add(positionWorld.x.mul(0.4))).mul(bend), 0,
    cos(time.mul(0.85).add(positionWorld.z.mul(0.3))).mul(bend).mul(0.6),
  ));
  return material;
}

function addTreeKind(scene: Scene, trees: TreeData[], kind: TreeKind, time: ReturnType<typeof uniform>): void {
  const selected = trees.filter((tree) => tree.kind === kind);
  if (!selected.length) return;
  const material = treeMaterial(time);
  const trunkHeight = kind === 'palm' ? 1.8 : kind === 'pine' ? 1.5 : 1.05;
  // Geometry is rooted at y=0 so the same instance matrix joins every tree part.
  const trunkGeometry = new CylinderGeometry(0.065, 0.12, trunkHeight, 7);
  trunkGeometry.translate(0, trunkHeight / 2, 0);
  const parts: Array<{ geometry: CylinderGeometry | ConeGeometry | SphereGeometry | PlaneGeometry; tint: string }> = [
    { geometry: trunkGeometry, tint: '#99714c' },
  ];
  if (kind === 'pine') {
    for (let layer = 0; layer < 3; layer += 1) {
      const canopy = new ConeGeometry(0.65 - layer * 0.15, 1.15 - layer * 0.15, 9);
      canopy.translate(0, 1.05 + layer * 0.48, 0);
      parts.push({ geometry: canopy, tint: ['#385c3e', '#48774b', '#5a8652'][layer] });
    }
  } else if (kind === 'broadleaf') {
    for (let lobe = 0; lobe < 3; lobe += 1) {
      const canopy = new SphereGeometry(0.57, 12, 9);
      const vertices = canopy.attributes.position;
      for (let i = 0; i < vertices.count; i += 1) {
        const x = vertices.getX(i);
        const y = vertices.getY(i);
        const z = vertices.getZ(i);
        const r = 1 + Math.sin(x * 13 + lobe) * Math.sin(z * 11 - y * 8) * 0.14;
        vertices.setXYZ(i, x * r, y * r, z * r);
      }
      canopy.computeVertexNormals();
      canopy.scale(1, 1.1, 0.85);
      canopy.translate(Math.cos(lobe * 2.1) * 0.3, 1.45 + (lobe === 0 ? 0.3 : 0), Math.sin(lobe * 2.1) * 0.3);
      parts.push({ geometry: canopy, tint: ['#668949', '#547f43', '#769751'][lobe] });
    }
  } else {
    // Curved tapered fronds replace the old solid umbrella cone.
    for (let frond = 0; frond < 7; frond += 1) {
      const leaf = new PlaneGeometry(1, 1, 1, 6);
      const pos = leaf.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const t = pos.getY(i) + 0.5;
        const width = Math.sin(t * Math.PI) * 0.26;
        const a = frond * Math.PI * 2 / 7;
        const side = pos.getX(i) * width;
        const length = t * 1.15;
        pos.setXYZ(i, Math.cos(a) * length - Math.sin(a) * side,
          1.8 + Math.sin(t * Math.PI) * 0.3 - t * t * 0.38,
          Math.sin(a) * length + Math.cos(a) * side);
      }
      leaf.computeVertexNormals();
      parts.push({ geometry: leaf, tint: '#6b944e' });
    }
  }
  for (const { geometry, tint } of parts) {
    const mesh = new InstancedMesh(geometry, material, selected.length);
    if (kind === 'palm') material.side = DoubleSide;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    selected.forEach((tree, index) => {
      quaternion.setFromEuler(new Euler(tree.lean, tree.rotation, tree.lean * 0.6));
      matrix.compose(new Vector3(tree.x, tree.y - 0.035, tree.z), quaternion,
        new Vector3(tree.scale, tree.scale * (0.92 + tree.tint * 0.16), tree.scale));
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new ThreeColor(tint).offsetHSL((tree.tint - 0.5) * 0.055, (tree.tint - 0.5) * 0.1, (tree.tint - 0.5) * 0.07));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function addOcean(scene: Scene, world: WorldData): { time: ReturnType<typeof uniform> } {
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
  const highlight = pow(max(dot(waterNormal, halfVector), float(0)), float(450));
  const broadHighlight = pow(max(dot(waterNormal, halfVector), float(0)), float(40)).mul(0.06);
  const glints = color('#fff1ce').mul(highlight.mul(2.5).add(broadHighlight));
  // Depth is sampled per fragment, not interpolated across a huge ocean triangle.
  const shore = float(1).sub(smoothstep(0.06, 0.42, depth));
  const breaker = sin(depth.mul(15).sub(time.mul(2.4)).add(sin(positionWorld.x.mul(8)).mul(0.45)))
    .mul(0.5).add(0.5);
  const foam = shore.mul(smoothstep(0.35, 0.78, breaker)).mul(0.82);
  material.colorNode = mix(reflected.add(glints), color('#f3fff1'), foam);
  // Beer-Lambert absorption: sand remains visible only in the shallow water.
  material.opacityNode = max(float(1).sub(exp(depth.mul(-2.5))), float(0.55)).add(foam).clamp(0, 1);
  scene.add(new Mesh(geometry, material));
  return { time };
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

export async function createIslandScene(canvas: HTMLCanvasElement, world: WorldData, forceWebGL2 = false): Promise<{
  renderer: WebGPURenderer;
  label: string;
  render: (time: number) => void;
  resize: () => void;
}> {
  // Keep pending WebGPU initialization off the displayed/fallback canvas. Its
  // adapter request cannot be cancelled and may finish after the timeout.
  const placeholder = canvas;
  const renderer = await initializeRenderer((forceWebGL) => new WebGPURenderer({
    canvas: placeholder.cloneNode(false) as HTMLCanvasElement,
    antialias: true,
    forceWebGL,
  }), forceWebGL2);
  canvas = renderer.domElement;
  placeholder.replaceWith(canvas);

  const scene = new Scene();
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
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const updateCamera = () => {
    orbitPitch = Math.max(0.035, Math.min(1.25, orbitPitch));
    distance = Math.max(15, Math.min(world.size * 2, distance));
    camera.position.set(target.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * distance,
      target.y + Math.sin(orbitPitch) * distance, target.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * distance);
    camera.lookAt(target);
  };
  updateCamera();
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    orbitYaw -= (event.clientX - lastX) * 0.008;
    orbitPitch += (event.clientY - lastY) * 0.006;
    lastX = event.clientX;
    lastY = event.clientY;
    updateCamera();
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    distance *= Math.exp(event.deltaY * 0.001);
    updateCamera();
  }, { passive: false });

  addSky(scene);
  addTerrain(scene, world);
  const treeTime = uniform(0);
  for (const kind of ['pine', 'broadleaf', 'palm'] as const) addTreeKind(scene, world.trees, kind, treeTime);
  const ocean = addOcean(scene, world);
  scene.add(new HemisphereLight('#c5defc', '#73654b', 3));
  const sun = new DirectionalLight('#ffe1a6', 3.2);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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

  const label = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend ? 'WebGL2' : 'WebGPU';
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;

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
  post.outputNode = shaded.add(bloom(sceneColor, 0.16, 0.4, 1.5));
  post.render();

  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
  const render = (time: number) => {
    treeTime.value = time * 0.001;
    ocean.time.value = time * 0.001;
    post.render();
  };
  return { renderer, label, render, resize };
}
