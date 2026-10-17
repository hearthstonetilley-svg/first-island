import {
  AmbientLight, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Float32BufferAttribute, Fog, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene,
  SRGBColorSpace,
} from 'three';
import { MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { color, float, length, mix, positionLocal, positionWorld, sin, cos, smoothstep, uniform, vec3 } from 'three/tsl';
import { WorldData } from '../world/generate';

type Renderer = WebGPURenderer;

const terrainMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });

function addTerrain(scene: Scene, world: WorldData): void {
  const geometry = new PlaneGeometry(world.size, world.size, world.resolution - 1, world.resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const height = world.heights[index];
    position.setY(index, height * 4.2);
    const band = world.bands[index];
    color.set(band === 'beach' ? '#d9bd76' : band === 'rock' ? '#757c71' : '#477747');
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  scene.add(new Mesh(geometry, terrainMaterial));
}

function addTrees(scene: Scene, world: WorldData): void {
  const trunk = new InstancedMesh(new CylinderGeometry(0.11, 0.16, 1, 6), new MeshStandardMaterial({ color: '#66503b' }), world.trees.length);
  const canopy = new InstancedMesh(new ConeGeometry(0.65, 1.45, 7), new MeshStandardMaterial({ color: '#2d633f', flatShading: true }), world.trees.length);
  const matrix = new Matrix4();
  world.trees.forEach((tree, index) => {
    matrix.makeScale(tree.scale, tree.scale, tree.scale);
    matrix.setPosition(tree.x, tree.y * 4.2 + 0.25, tree.z);
    trunk.setMatrixAt(index, matrix);
    matrix.makeScale(tree.scale, tree.scale, tree.scale);
    matrix.setPosition(tree.x, tree.y * 4.2 + 1.25 * tree.scale, tree.z);
    canopy.setMatrixAt(index, matrix);
  });
  trunk.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  scene.add(trunk, canopy);
}

function addOcean(scene: Scene): { mesh: Mesh; time: ReturnType<typeof uniform> } {
  const geometry = new PlaneGeometry(180, 180, 120, 120);
  geometry.rotateX(-Math.PI / 2);
  const time = uniform(0);
  const material = new MeshBasicNodeMaterial({ transparent: true, opacity: 0.96 });
  const wave = sin(positionLocal.x.mul(0.22).add(time)).mul(0.08)
    .add(cos(positionLocal.z.mul(0.17).add(time.mul(0.8))).mul(0.06));
  material.positionNode = positionLocal.add(vec3(0, wave, 0));
  const depth = smoothstep(float(4), float(70), length(positionWorld.xz));
  material.colorNode = mix(color('#258f98'), color('#08294f'), depth);
  const ocean = new Mesh(geometry, material);
  ocean.position.y = 0;
  scene.add(ocean);
  return { mesh: ocean, time };
}

export async function createIslandScene(canvas: HTMLCanvasElement, world: WorldData, forceWebGL2 = false): Promise<{ renderer: Renderer; label: string; render: (time: number) => void }> {
  const scene = new Scene();
  scene.background = new Color('#a9d6dc');
  scene.fog = new Fog('#a9d6dc', 38, 105);
  const camera = new PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
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
    camera.position.set(
      Math.sin(orbitYaw) * Math.cos(orbitPitch) * distance,
      Math.sin(orbitPitch) * distance,
      Math.cos(orbitYaw) * Math.cos(orbitPitch) * distance,
    );
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
  addTerrain(scene, world);
  addTrees(scene, world);
  const ocean = addOcean(scene);
  scene.add(new AmbientLight('#b8d5d1', 1.4));
  const sun = new DirectionalLight('#fff1cf', 2.5);
  sun.position.set(-10, 25, 12);
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

  const render = (time: number) => {
    ocean.time.value = time * 0.001;
    renderer.render(scene, camera);
  };
  return { renderer, label, render };
}
