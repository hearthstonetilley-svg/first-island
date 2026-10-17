import {
  ACESFilmicToneMapping, AmbientLight, BackSide, Color as ThreeColor, ConeGeometry, CylinderGeometry,
  DirectionalLight, Float32BufferAttribute, Fog, HemisphereLight, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, SRGBColorSpace,
  Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, WebGPURenderer } from 'three/webgpu';
import {
  attribute, cameraPosition, color, cos, dot, float, max, mix, normalize, normalWorld,
  positionLocal, positionWorld, pow, sin, smoothstep, uniform, vec3,
} from 'three/tsl';
import { TreeData, TreeKind, WorldData } from '../world/generate';

type Renderer = WebGPURenderer;

const SUN_DIRECTION = new Vector3(-0.45, 0.8, 0.3).normalize();

function addTerrain(scene: Scene, world: WorldData): void {
  const geometry = new PlaneGeometry(world.size, world.size, world.resolution - 1, world.resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const terrainColor = new ThreeColor();
  const wetSand = new ThreeColor('#a88755');
  const drySand = new ThreeColor('#d9bd76');
  const grass = new ThreeColor('#477747');
  const rock = new ThreeColor('#73766e');
  const heightAt = (row: number, column: number) => world.heights[Math.max(0, Math.min(world.resolution - 1, row)) * world.resolution + Math.max(0, Math.min(world.resolution - 1, column))];

  for (let index = 0; index < position.count; index += 1) {
    const row = Math.floor(index / world.resolution);
    const column = index % world.resolution;
    const height = world.heights[index];
    const slope = Math.abs(heightAt(row, column + 1) - heightAt(row, column - 1)) + Math.abs(heightAt(row + 1, column) - heightAt(row - 1, column));
    position.setY(index, height * 4.2);
    if (height < 0.06) terrainColor.copy(wetSand);
    else if (height < 0.16) terrainColor.copy(drySand);
    else if (height > 0.56 || slope > 0.18) terrainColor.copy(rock);
    else terrainColor.copy(grass);
    if (height > 0.2 && height < 0.5) terrainColor.offsetHSL((index % 7 - 3) * 0.004, 0, (index % 5 - 2) * 0.012);
    const slopeRock = Math.max(0, Math.min(1, (slope - 0.12) * 4));
    terrainColor.lerp(rock, slopeRock);
    colors[index * 3] = terrainColor.r;
    colors[index * 3 + 1] = terrainColor.g;
    colors[index * 3 + 2] = terrainColor.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

function createWindMaterial(baseColor: string, time: ReturnType<typeof uniform>): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({ color: baseColor, roughness: 0.88, vertexColors: true });
  const sway = sin(positionLocal.y.mul(1.6).add(time.mul(0.8))).mul(positionLocal.y.abs().mul(0.035));
  material.positionNode = positionLocal.add(vec3(sway, 0, cos(positionLocal.y.mul(1.4).add(time.mul(0.65))).mul(positionLocal.y.abs().mul(0.025))));
  return material;
}

function setTreeMatrix(matrix: Matrix4, tree: TreeData, y: number, scaleY: number): void {
  matrix.makeScale(tree.scale, tree.scale * scaleY, tree.scale);
  matrix.setPosition(tree.x, y, tree.z);
}

function addTreeKind(scene: Scene, trees: TreeData[], kind: TreeKind, time: ReturnType<typeof uniform>): void {
  const selected = trees.filter((tree) => tree.kind === kind);
  if (selected.length === 0) return;
  const trunkHeight = kind === 'palm' ? 1.7 : 0.9;
  const canopyGeometry = kind === 'pine'
    ? new ConeGeometry(0.68, 1.85, 8)
    : kind === 'broadleaf'
      ? new SphereGeometry(0.78, 8, 6)
      : new ConeGeometry(0.82, 0.46, 8);
  const trunk = new InstancedMesh(new CylinderGeometry(0.1, kind === 'palm' ? 0.13 : 0.16, trunkHeight, 7), createWindMaterial('#66503b', time), selected.length);
  const canopy = new InstancedMesh(canopyGeometry, createWindMaterial(kind === 'palm' ? '#70b579' : kind === 'broadleaf' ? '#6cae6b' : '#5f9a62', time), selected.length);
  const matrix = new Matrix4();
  selected.forEach((tree, index) => {
    const trunkColor = new ThreeColor('#66503b').offsetHSL(0, 0, (tree.tint - 0.5) * 0.12);
    const canopyColor = new ThreeColor(kind === 'palm' ? '#70b579' : kind === 'broadleaf' ? '#6cae6b' : '#5f9a62').offsetHSL((tree.tint - 0.5) * 0.04, 0, (tree.tint - 0.5) * 0.12);
    setTreeMatrix(matrix, tree, tree.y * 4.2 + trunkHeight * tree.scale * 0.5, 1);
    trunk.setMatrixAt(index, matrix);
    trunk.setColorAt(index, trunkColor);
    const canopyY = kind === 'pine' ? 1.25 : kind === 'broadleaf' ? 1.55 : 2.05;
    setTreeMatrix(matrix, tree, tree.y * 4.2 + canopyY * tree.scale, kind === 'palm' ? 1 : 1.05);
    canopy.setMatrixAt(index, matrix);
    canopy.setColorAt(index, canopyColor);
  });
  trunk.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  trunk.castShadow = true;
  canopy.castShadow = true;
  trunk.receiveShadow = true;
  canopy.receiveShadow = true;
  scene.add(trunk, canopy);
}

function addTrees(scene: Scene, world: WorldData, time: ReturnType<typeof uniform>): void {
  addTreeKind(scene, world.trees, 'pine', time);
  addTreeKind(scene, world.trees, 'broadleaf', time);
  addTreeKind(scene, world.trees, 'palm', time);
}

function terrainDepth(world: WorldData, x: number, z: number): number {
  if (Math.abs(x) > world.size * 0.5 || Math.abs(z) > world.size * 0.5) return 9 + Math.hypot(x, z) * 0.12;
  const column = Math.round((x / world.size + 0.5) * (world.resolution - 1));
  const row = Math.round((z / world.size + 0.5) * (world.resolution - 1));
  return Math.max(0.03, -world.heights[row * world.resolution + column] * 4.2);
}

function addOcean(scene: Scene, world: WorldData): { time: ReturnType<typeof uniform> } {
  const geometry = new PlaneGeometry(1200, 1200, 64, 64);
  geometry.rotateX(-Math.PI / 2);
  const depths = new Float32Array(geometry.attributes.position.count);
  for (let index = 0; index < depths.length; index += 1) {
    const vertex = geometry.attributes.position;
    depths[index] = terrainDepth(world, vertex.getX(index), vertex.getZ(index));
  }
  geometry.setAttribute('waterDepth', new Float32BufferAttribute(depths, 1));
  const time = uniform(0);
  const material = new MeshBasicNodeMaterial({ transparent: true, opacity: 0.97 });
  const wave = sin(positionLocal.x.mul(0.21).add(time.mul(0.75))).mul(0.11)
    .add(sin(positionLocal.z.mul(0.31).sub(time.mul(0.55))).mul(0.065))
    .add(sin(positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.12)).add(time.mul(0.34))).mul(0.09))
    .add(cos(positionLocal.x.mul(0.42).sub(positionLocal.z.mul(0.25)).add(time.mul(1.1))).mul(0.025));
  material.positionNode = positionLocal.add(vec3(0, wave, 0));
  const depth = attribute('waterDepth', 'float');
  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const fresnel = pow(float(1).sub(max(dot(normalWorld, viewDirection), float(0))), float(4));
  const depthColor = mix(color('#32b8b2'), color('#062752'), smoothstep(float(0.35), float(8), depth));
  const reflectedSky = mix(depthColor, color('#a9d6dc'), fresnel.mul(0.72));
  const halfVector = normalize(vec3(-SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z).add(viewDirection));
  const glint = pow(max(dot(normalWorld, halfVector), float(0)), float(72)).mul(color('#fff2bf')).mul(0.9);
  const foam = float(1).sub(smoothstep(float(0.03), float(0.3), depth));
  material.colorNode = mix(reflectedSky.add(glint), color('#e9f0cf'), foam.mul(0.75));
  const ocean = new Mesh(geometry, material);
  ocean.position.y = 0;
  ocean.receiveShadow = true;
  scene.add(ocean);
  return { time };
}

function addSky(scene: Scene): void {
  const skyMaterial = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false });
  const vertical = positionLocal.y.div(float(150));
  skyMaterial.colorNode = mix(color('#8db9c8'), color('#dce9d5'), smoothstep(float(-0.12), float(0.82), vertical));
  scene.add(new Mesh(new SphereGeometry(150, 32, 16), skyMaterial));
  const sun = new Mesh(new SphereGeometry(4.5, 16, 8), new MeshBasicNodeMaterial({ color: '#fff2bd' }));
  sun.position.copy(SUN_DIRECTION).multiplyScalar(125);
  scene.add(sun);
}

export async function createIslandScene(canvas: HTMLCanvasElement, world: WorldData, forceWebGL2 = false): Promise<{
  renderer: Renderer;
  label: string;
  render: (time: number) => void;
  resize: () => void;
}> {
  const scene = new Scene();
  scene.background = new ThreeColor('#a9d6dc');
  scene.fog = new Fog('#a9d6dc', 42, 120);
  const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 220);
  camera.position.set(18, 15, 20);
  camera.lookAt(0, 1, 0);
  let orbitYaw = Math.atan2(camera.position.x, camera.position.z);
  let orbitPitch = 0.58;
  let distance = camera.position.length();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const updateCamera = () => {
    orbitPitch = Math.max(0.2, Math.min(1.25, orbitPitch));
    distance = Math.max(12, Math.min(48, distance));
    camera.position.set(Math.sin(orbitYaw) * Math.cos(orbitPitch) * distance, Math.sin(orbitPitch) * distance, Math.cos(orbitYaw) * Math.cos(orbitPitch) * distance);
    camera.lookAt(0, 1, 0);
  };
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
    distance += event.deltaY * 0.025;
    updateCamera();
  }, { passive: false });

  addSky(scene);
  addTerrain(scene, world);
  const treeTime = uniform(0);
  addTrees(scene, world, treeTime);
  const ocean = addOcean(scene, world);
  scene.add(new AmbientLight('#aacbc5', 1.05));
  scene.add(new HemisphereLight('#b4dce1', '#4d513f', 1.45));
  const sun = new DirectionalLight('#fff0cc', 2.7);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(32);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  scene.add(sun);

  let renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: forceWebGL2 });
  let label = forceWebGL2 ? 'WebGL2' : 'WebGPU';
  const initialized = await Promise.race([
    renderer.init().then(() => true),
    new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 1500)),
  ]);
  if (!initialized) {
    renderer.dispose();
    renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
    await renderer.init();
    label = 'WebGL2';
  } else if ((renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend) {
    label = 'WebGL2';
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.render(scene, camera);

  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  };
  const render = (time: number) => {
    treeTime.value = time * 0.001;
    ocean.time.value = time * 0.001;
    renderer.render(scene, camera);
  };
  return { renderer, label, render, resize };
}
