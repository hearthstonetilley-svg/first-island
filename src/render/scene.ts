import {
  AmbientLight, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Float32BufferAttribute, Fog, InstancedMesh, Matrix4, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene, ShaderMaterial,
  SRGBColorSpace, WebGLRenderer,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { WorldData } from '../world/generate';

type Renderer = WebGPURenderer | WebGLRenderer;

const terrainMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });

function addTerrain(scene: Scene, world: WorldData): void {
  const geometry = new PlaneGeometry(world.size, world.size, world.resolution - 1, world.resolution - 1);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const height = world.heights[index];
    position.setY(index, height * 4.2 - 0.35);
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

function addOcean(scene: Scene): Mesh {
  const geometry = new PlaneGeometry(180, 180, 120, 120);
  geometry.rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vWorld; uniform float time; void main() { vec3 p = position; p.y += sin(p.x * 0.22 + time) * 0.08 + cos(p.z * 0.17 + time * 0.8) * 0.06; vec4 world = modelMatrix * vec4(p, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `varying vec3 vWorld; void main() { float depth = smoothstep(4.0, 33.0, length(vWorld.xz)); vec3 shallow = vec3(0.13, 0.49, 0.54); vec3 deep = vec3(0.025, 0.13, 0.27); gl_FragColor = vec4(mix(shallow, deep, depth), 0.96); }`,
    transparent: true,
  });
  const ocean = new Mesh(geometry, material);
  ocean.position.y = 0;
  scene.add(ocean);
  return ocean;
}

export async function createIslandScene(canvas: HTMLCanvasElement, world: WorldData): Promise<{ renderer: Renderer; label: string; render: (time: number) => void }> {
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

  let renderer: Renderer;
  let label: string;
  if ('gpu' in navigator) {
    try {
      const webgpu = new WebGPURenderer({ canvas, antialias: true });
      await webgpu.init();
      renderer = webgpu;
      label = 'WebGPU';
    } catch {
      renderer = new WebGLRenderer({ canvas, antialias: true });
      label = 'WebGL2';
    }
  } else {
    renderer = new WebGLRenderer({ canvas, antialias: true });
    label = 'WebGL2';
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = SRGBColorSpace;

  const render = (time: number) => {
    (ocean.material as ShaderMaterial).uniforms.time.value = time * 0.001;
    renderer.render(scene, camera);
  };
  return { renderer, label, render };
}
