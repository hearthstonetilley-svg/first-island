import { Agent } from './types';

export const REPRODUCTION_BLOCKERS = { ageWindow: 1, cooldown: 2, health: 4, energy: 8, rest: 16, warmth: 32 } as const;
export const MATING_DISTANCE = 1.05;
type ReproductiveBody = Agent & { cooldown: number };

/** Shared by admission and diagnostics: independent, non-exclusive failures. */
export function reproductionBlockers(a: ReproductiveBody): number {
  let failed = 0;
  if (!(a.biologicalAge >= 0.3 && a.biologicalAge < a.traits.lifespan * 0.88)) failed |= REPRODUCTION_BLOCKERS.ageWindow;
  if (!(a.cooldown <= 0)) failed |= REPRODUCTION_BLOCKERS.cooldown;
  if (!(a.health > 75)) failed |= REPRODUCTION_BLOCKERS.health;
  if (!(a.energy > 70)) failed |= REPRODUCTION_BLOCKERS.energy;
  if (!(a.rest > 45)) failed |= REPRODUCTION_BLOCKERS.rest;
  if (!(a.warmth > 40)) failed |= REPRODUCTION_BLOCKERS.warmth;
  return failed;
}

export function reproductionDiagnostics(agents: readonly ReproductiveBody[]) {
  const masks = agents.map(reproductionBlockers);
  const failures = { ageWindow: 0, cooldown: 0, health: 0, energy: 0, rest: 0, warmth: 0, partnerInRange: 0 };
  let readySelf = 0, readyWithPartner = 0, noNeighbour = 0;
  const only = { energy: 0, rest: 0, warmth: 0 };
  for (let i = 0; i < agents.length; i++) {
    for (const key of Object.keys(REPRODUCTION_BLOCKERS) as Array<keyof typeof REPRODUCTION_BLOCKERS>) {
      if (masks[i] & REPRODUCTION_BLOCKERS[key]) failures[key]++;
    }
    for (const key of Object.keys(only) as Array<keyof typeof only>) if (masks[i] === REPRODUCTION_BLOCKERS[key]) only[key]++;
    let neighbour = false, eligiblePartner = false;
    for (let j = 0; j < agents.length; j++) {
      if (i === j || Math.hypot(agents[i].x - agents[j].x, agents[i].z - agents[j].z) >= MATING_DISTANCE) continue;
      neighbour = true;
      if (masks[j] === 0) eligiblePartner = true;
    }
    if (!neighbour) noNeighbour++;
    if (!eligiblePartner) failures.partnerInRange++;
    if (masks[i] === 0) { readySelf++; if (eligiblePartner) readyWithPartner++; }
  }
  const mean = (key: 'energy' | 'rest' | 'warmth') => agents.length ? agents.reduce((sum, a) => sum + a[key], 0) / agents.length : 0;
  return { population: agents.length, failures, readySelf, readyWithPartner, noNeighbour, only,
    meanNeeds: { energy: mean('energy'), rest: mean('rest'), warmth: mean('warmth') } };
}
