import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { Simulation } from '../src/sim/core';
import { TreeFigures } from '../src/render/trees';

describe('simulation-owned trees and food snapshots', () => {
  it('changes the drawn forest and fruit from subsequent snapshots without baking the generated world', () => {
    const sim = new Simulation(42), snapshot = sim.snapshot(), scene = new Scene();
    const tree = snapshot.trees.find(tree => tree.foodId !== null)!;
    const stock = snapshot.plants.find(plant => plant.id === tree.foodId)!;
    snapshot.trees = [tree]; snapshot.plants = [stock];
    const figures = new TreeFigures(scene, uniform(0), snapshot);
    const fruit = () => scene.children.find(object => object.userData.foodFigure) as InstancedMesh;
    const matrix = new Matrix4(), position = new Vector3(), scale = new Vector3();
    expect(fruit().count).toBe(4);
    fruit().getMatrixAt(0, matrix); scale.setFromMatrixScale(matrix);
    const fullScale = scale.x;
    stock.quantity /= 8;
    figures.receive(snapshot);
    fruit().getMatrixAt(0, matrix); scale.setFromMatrixScale(matrix);
    expect(scale.x).toBeCloseTo(fullScale / 2, 5);
    stock.quantity = 0; figures.receive(snapshot);
    expect(fruit().count).toBe(0);
    stock.quantity = stock.capacity; figures.receive(snapshot);
    expect(fruit().count).toBe(4);
    const originalX = tree.x; tree.x += 5; figures.receive(snapshot);
    const bark = scene.children.find(object => object instanceof InstancedMesh && !object.userData.foodFigure && object.count > 0) as InstancedMesh;
    bark.getMatrixAt(0, matrix); position.setFromMatrixPosition(matrix);
    expect(position.x).toBeCloseTo(originalX + 5);
    snapshot.trees = []; figures.receive(snapshot);
    expect(scene.children.every(object => !(object instanceof InstancedMesh) || object.count === 0)).toBe(true);
    expect(sim.snapshot().trees.length).toBeGreaterThan(1);
    expect(sim.snapshot().plants.find(plant => plant.id === stock.id)!.quantity).toBe(stock.capacity);
    figures.dispose();
  });
  it('links actual consumption to the authoritative trees without renderer-owned food state', () => {
    const sim = new Simulation(42), initial = sim.snapshot();
    sim.step(600);
    const snapshot = sim.snapshot();
    const eaten = snapshot.plants.filter(plant => plant.tree && plant.quantity < plant.capacity);
    expect(eaten.length).toBeGreaterThan(0);
    expect(eaten.every(plant => snapshot.trees.some(tree => tree.foodId === plant.id))).toBe(true);
    expect(initial.plants.every(plant => plant.quantity === plant.capacity)).toBe(true);
  });
});
