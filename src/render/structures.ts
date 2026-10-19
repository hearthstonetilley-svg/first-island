import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, Scene, SphereGeometry, TorusGeometry } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';

export interface StructureData { id: number; kind: string; x: number; y: number; z: number; colour: string }

/** Things the agents build, placed where they built them. Shapes are simple and
 * readable from the default camera; colour comes from the material they used. */
export class Structures {
  private readonly built = new Map<number, Group>();
  constructor(private readonly scene: Scene) {}
  add(s: StructureData): void {
    if (this.built.has(s.id)) return;
    const body = new MeshStandardNodeMaterial({ color: s.colour, roughness: 0.75 });
    const glow = new MeshStandardNodeMaterial({ color: s.colour, emissive: s.colour, emissiveIntensity: 1.4 });
    const group = new Group();
    const add = (mesh: Mesh, y: number) => { mesh.position.y = y; mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); };
    if (s.kind === 'hut') { add(new Mesh(new CylinderGeometry(0.45, 0.5, 0.45, 8), body), 0.22); add(new Mesh(new ConeGeometry(0.62, 0.5, 8), body), 0.7); }
    else if (s.kind === 'tower') { add(new Mesh(new CylinderGeometry(0.18, 0.26, 1.6, 6), body), 0.8); add(new Mesh(new SphereGeometry(0.16, 10, 8), glow), 1.7); }
    else if (s.kind === 'beacon') { add(new Mesh(new CylinderGeometry(0.05, 0.07, 1.1, 5), body), 0.55); add(new Mesh(new SphereGeometry(0.24, 12, 10), glow), 1.2); }
    else if (s.kind === 'ring') { const ring = new Mesh(new TorusGeometry(0.6, 0.09, 6, 18), body); ring.rotation.x = Math.PI / 2; add(ring, 0.1); }
    // Craft moored at the shore (decision 59): a raft is a flat deck of logs; a boat is a raft with raised, sealed sides.
    else if (s.kind === 'raft') add(new Mesh(new BoxGeometry(1.1, 0.12, 0.7), body), 0.06);
    else if (s.kind === 'boat') { add(new Mesh(new BoxGeometry(1.2, 0.14, 0.7), body), 0.07); add(new Mesh(new BoxGeometry(1.2, 0.22, 0.08), body).translateZ(0.31), 0.2); add(new Mesh(new BoxGeometry(1.2, 0.22, 0.08), body).translateZ(-0.31), 0.2); }
    else add(new Mesh(new BoxGeometry(0.5, 0.5, 0.5), body), 0.25);
    group.position.set(s.x, s.y, s.z);
    group.userData.kind = s.kind;
    this.scene.add(group);
    this.built.set(s.id, group);
  }
  /** A craft leaving its mooring (decision 59) leaves the scene too. */
  remove(id: number): void {
    const group = this.built.get(id); if (!group) return;
    this.scene.remove(group); this.built.delete(id);
    group.traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); });
  }
  /** The kinds drawn now, one entry per structure, for checks that the page matches the island. */
  kinds(): string[] { return [...this.built.values()].map(g => String(g.userData.kind ?? '')); }
}
