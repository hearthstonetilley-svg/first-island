import {
  BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, Quaternion,
  SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface TreePart { geometry: BufferGeometry; tint: string }

type CrownLobe = [x: number, y: number, z: number, width: number, height: number, depth: number];

// Spreading, upright multi-stem and asymmetric crowns. These templates are
// instanced; existing seeded tree attributes select and stretch each silhouette.
const CROWNS: CrownLobe[][] = [
  [
    [-0.48, 1.23, -0.12, 0.68, 0.42, 0.55], [0.32, 1.4, 0.18, 0.75, 0.48, 0.6],
    [-0.08, 1.8, -0.1, 0.75, 0.43, 0.58], [0.68, 1.18, -0.18, 0.5, 0.44, 0.48],
    [-0.5, 1.58, 0.38, 0.5, 0.45, 0.5],
  ],
  [
    [-0.32, 1.1, 0.05, 0.46, 0.6, 0.46], [0.3, 1.45, -0.1, 0.5, 0.65, 0.42],
    [-0.1, 1.95, 0.12, 0.5, 0.62, 0.45], [0.42, 1.05, 0.35, 0.48, 0.43, 0.5],
  ],
  [
    [-0.35, 1.05, -0.1, 0.52, 0.43, 0.45], [0.22, 1.4, 0.18, 0.62, 0.45, 0.6],
    [0.62, 1.72, -0.1, 0.74, 0.4, 0.52], [0.94, 1.28, 0.27, 0.5, 0.4, 0.44],
    [0.1, 1.94, -0.18, 0.5, 0.38, 0.45],
  ],
];

function branch(start: Vector3, end: Vector3, radius: number): BufferGeometry {
  const direction = end.clone().sub(start);
  const geometry = new CylinderGeometry(radius * 0.45, radius, direction.length(), 6);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize()));
  const middle = start.clone().add(end).multiplyScalar(0.5);
  geometry.translate(middle.x, middle.y, middle.z);
  return geometry;
}

export function createBroadleafParts(variant: number): TreePart[] {
  const crown = CROWNS[variant];
  const trunkHeight = [0.9, 1.1, 0.75][variant];
  const trunk = new CylinderGeometry(0.06, 0.12, trunkHeight, 7);
  trunk.translate(0, trunkHeight * 0.5, 0);
  const bark: BufferGeometry[] = [trunk];
  const foliage: BufferGeometry[] = [];
  const palette = ['#6c8d46', '#55743f', '#829957', '#60854a', '#78934f'];
  crown.forEach(([x, y, z, width, height, depth], lobe) => {
    bark.push(branch(new Vector3(0, trunkHeight * 0.65, 0), new Vector3(x, y, z), 0.055));
    const geometry = new SphereGeometry(1, 10, 8);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const leafColor = new Color(palette[(lobe + variant) % palette.length]);
    for (let i = 0; i < position.count; i += 1) {
      const px = position.getX(i);
      const py = position.getY(i);
      const pz = position.getZ(i);
      // Unequal lobes, offset centres and rough outlines survive at island scale.
      const r = 1 + Math.sin(px * 9 + lobe * 2) * Math.sin(pz * 8 - py * 7 + variant) * 0.19;
      position.setXYZ(i, x + px * width * r + py * 0.12, y + py * height * r, z + pz * depth * r);
      const light = 0.88 + (py + 1) * 0.09;
      colors.set([leafColor.r * light, leafColor.g * light, leafColor.b * light], i * 3);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    foliage.push(geometry);
  });
  const mergedBark = mergeGeometries(bark)!;
  const mergedFoliage = mergeGeometries(foliage)!;
  for (const geometry of [...bark, ...foliage]) geometry.dispose();
  return [{ geometry: mergedBark, tint: '#99714c' }, { geometry: mergedFoliage, tint: '#e0e8cb' }];
}
