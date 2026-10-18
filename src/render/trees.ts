import { Color as ThreeColor, ConeGeometry, CylinderGeometry, DoubleSide, Euler, InstancedMesh,
  Matrix4, PlaneGeometry, Quaternion, Scene, SphereGeometry, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { cos, float, max, positionLocal, positionWorld, sin, uniform, vec3 } from 'three/tsl';
import { TreeKind } from '../world/generate';
import { Snapshot, Tree } from '../sim/types';
import { createBroadleafParts, TreePart } from './broadleaf';

type Group = { mesh: InstancedMesh; select: (trees: Tree[]) => Tree[]; tint: string };

function treeMaterial(time: ReturnType<typeof uniform>): MeshStandardNodeMaterial {
  // Instance colours already contain the bark/leaf hue. A second dark base colour
  // would multiply it again and turn the trunks almost black.
  const material = new MeshStandardNodeMaterial({ color: '#ffffff', roughness: 0.92, vertexColors: true });
  const bend = max(positionLocal.y, float(0)).pow(2).mul(0.012);
  material.positionNode = positionLocal.add(vec3(
    sin(time.mul(1.2).add(positionWorld.x.mul(0.4))).mul(bend), 0,
    cos(time.mul(0.85).add(positionWorld.z.mul(0.3))).mul(bend).mul(0.6),
  ));
  return material;
}

function addTreeKind(scene: Scene, kind: TreeKind, time: ReturnType<typeof uniform>, groups: Group[]): void {
  const select = (trees: Tree[]) => trees.filter(tree => tree.kind === kind);
  const material = treeMaterial(time);
  if (kind === 'broadleaf') {
    for (let variant = 0; variant < 3; variant += 1) {
      addTreeParts(scene, trees => select(trees).filter(tree => Math.min(2, Math.floor(tree.tint * 3)) === variant), createBroadleafParts(variant), material, groups);
    }
    return;
  }
  const trunkHeight = kind === 'palm' ? 1.8 : 1.5;
  // Geometry is rooted at y=0 so the same instance matrix joins every tree part.
  const trunkGeometry = new CylinderGeometry(0.065, 0.12, trunkHeight, 7);
  trunkGeometry.translate(0, trunkHeight / 2, 0);
  const parts: TreePart[] = [
    { geometry: trunkGeometry, tint: '#99714c' },
  ];
  if (kind === 'pine') {
    for (let layer = 0; layer < 3; layer += 1) {
      const canopy = new ConeGeometry(0.65 - layer * 0.15, 1.15 - layer * 0.15, 9);
      canopy.translate(0, 1.05 + layer * 0.48, 0);
      parts.push({ geometry: canopy, tint: ['#385c3e', '#48774b', '#5a8652'][layer] });
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
  if (kind === 'palm') material.side = DoubleSide;
  addTreeParts(scene, select, parts, material, groups);
}

function addTreeParts(scene: Scene, select: Group['select'], parts: TreePart[], material: MeshStandardNodeMaterial, groups: Group[]): void {
  for (const { geometry, tint } of parts) {
    const mesh = new InstancedMesh(geometry, material, 1);
    mesh.count = 0;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    groups.push({ mesh, select, tint });
  }
}

/** Rendering consumes only authoritative tree/plant snapshots, including after recovery.
 * Geometry templates stay the v0.3 templates; instances can move, disappear or change kind. */
export class TreeFigures {
  private readonly groups: Group[] = [];
  private fruit: InstancedMesh;
  private treeSignature = '';
  constructor(private readonly scene: Scene, time: ReturnType<typeof uniform>, snapshot?: Snapshot) {
    for (const kind of ['pine', 'broadleaf', 'palm'] as const) addTreeKind(scene, kind, time, this.groups);
    this.fruit = new InstancedMesh(new SphereGeometry(0.105, 6, 5),
      new MeshStandardNodeMaterial({ color: '#db9d40', roughness: 0.85 }), 1);
    this.fruit.count = 0;
    this.fruit.userData.foodFigure = true;
    scene.add(this.fruit);
    if (snapshot) this.receive(snapshot);
  }
  private capacity(mesh: InstancedMesh, count: number): InstancedMesh {
    if (count <= mesh.instanceMatrix.count) return mesh;
    const next = new InstancedMesh(mesh.geometry, mesh.material, Math.max(count, mesh.instanceMatrix.count * 2));
    next.castShadow = mesh.castShadow; next.receiveShadow = mesh.receiveShadow;
    next.userData = { ...mesh.userData };
    this.scene.remove(mesh); mesh.dispose(); this.scene.add(next);
    return next;
  }
  receive(snapshot: Snapshot): void {
    const matrix = new Matrix4(), quaternion = new Quaternion();
    const signature = JSON.stringify(snapshot.trees);
    if (signature !== this.treeSignature) {
      this.treeSignature = signature;
      for (const group of this.groups) {
        const selected = group.select(snapshot.trees);
        group.mesh = this.capacity(group.mesh, selected.length);
        selected.forEach((tree, index) => {
          quaternion.setFromEuler(new Euler(tree.lean, tree.rotation, tree.lean * 0.6));
          const wide = tree.kind === 'broadleaf' ? 1 + Math.sin(tree.rotation * 2.7) * 0.18 : 1;
          const deep = tree.kind === 'broadleaf' ? 1 + Math.cos(tree.rotation * 1.9) * 0.15 : 1;
          matrix.compose(new Vector3(tree.x, tree.y - 0.035, tree.z), quaternion,
            new Vector3(tree.scale * wide, tree.scale * (0.92 + tree.tint * 0.16), tree.scale * deep));
          group.mesh.setMatrixAt(index, matrix);
          group.mesh.setColorAt(index, new ThreeColor(group.tint).offsetHSL((tree.tint - 0.5) * 0.055,
            (tree.tint - 0.5) * 0.1, (tree.tint - 0.5) * 0.07));
        });
        group.mesh.count = selected.length;
        group.mesh.instanceMatrix.needsUpdate = true;
        if (group.mesh.instanceColor) group.mesh.instanceColor.needsUpdate = true;
        group.mesh.computeBoundingSphere();
      }
    }
    const plants = new Map(snapshot.plants.map(plant => [plant.id, plant]));
    this.fruit = this.capacity(this.fruit, snapshot.trees.length * 4);
    let count = 0;
    for (const tree of snapshot.trees) {
      const food = tree.foodId === null ? undefined : plants.get(tree.foodId);
      if (!food || food.quantity <= 0 || food.nutrition <= 0 || food.capacity <= 0) continue;
      // Four stock cues shrink as food is consumed; no renderer-owned regrowth.
      const fullness = Math.min(1, food.quantity / food.capacity);
      for (let part = 0; part < 4; part++) {
        const angle = tree.rotation + part * Math.PI / 2;
        const size = tree.scale * Math.cbrt(fullness);
        matrix.compose(new Vector3(tree.x + Math.cos(angle) * tree.scale * 0.38,
          tree.y + tree.scale * 1.03, tree.z + Math.sin(angle) * tree.scale * 0.38),
          quaternion.identity(), new Vector3(size, size, size));
        this.fruit.setMatrixAt(count++, matrix);
      }
    }
    this.fruit.count = count;
    this.fruit.instanceMatrix.needsUpdate = true;
    this.fruit.computeBoundingSphere();
  }
  dispose(): void {
    // Scene cleanup owns the shared geometries/materials; release instance buffers here.
    for (const group of this.groups) group.mesh.dispose();
    this.fruit.dispose();
  }
}
