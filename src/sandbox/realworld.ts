// Real-world materials and recipes (decision 49). Every reaction here is something
// that works in the real world, simplified to two inputs, so an agent's guess about
// what a combination makes is a hypothesis that can be checked against reality.
import { Chemistry, Ground, Substance, Reaction } from './chemistry';

type Spec = [name: string, description: string, tier: number, colour: string, extra?: Partial<Substance>];
const S = (name: string, description: string, tier: number, colour: string, extra: Partial<Substance> = {}): Spec => [name, description, tier, colour, extra];
const at = (ground: Ground) => ({ ground });

const SPECS: Spec[] = [
  // Gathered where they are found.
  S('sand', 'fine grains of quartz', 0, '#e2cf9a', at('shore')),
  S('shell', 'a hard sea shell', 0, '#efe6d6', at('shore')),
  S('seaweed', 'wet kelp washed ashore', 0, '#4f7d4a', { ground: 'shore', food: 0.1, floats: 'drifts' }),
  S('driftwood', 'dry, salt-bleached wood', 0, '#b9a58a', { ground: 'shore', floats: 'rolls' }),
  S('water', 'fresh water from a seep', 0, '#6fb7e0', at('shore')),
  S('wood', 'a straight branch cut from a living tree', 0, '#8a6038', { ground: 'grove', needs: ['flint flake', 'blade', 'axe', 'obsidian blade'], floats: 'rolls' }),
  S('plant fibre', 'long fibres stripped from bark and leaves', 0, '#a8b77a', { ground: 'grove', floats: 'drifts' }),
  S('resin', 'sticky tree sap', 0, '#d39a3a', at('grove')),
  S('fruit', 'ripe fruit from the trees', 0, '#e0784a', { ground: 'grove', food: 0.3, floats: 'drifts' }),
  S('clay', 'wet, sticky earth', 0, '#b06b4c', at('meadow')),
  S('dry grass', 'brittle, dry grass', 0, '#d8c46a', { ground: 'meadow', floats: 'drifts' }),
  S('red berries', 'small shiny red berries', 0, '#c0303a', { ground: 'meadow', food: -0.25 }),
  S('flint', 'a glassy, hard stone', 0, '#4a4f58', at('high rock')),
  S('stone', 'a heavy rounded stone', 0, '#8f9399', at('high rock')),
  S('pyrite', 'brassy, heavy crystals', 0, '#c9a94a', at('high rock')),
  S('obsidian', 'black pebbles of volcanic glass, sharper than flint', 0, '#1c1a22', { ground: 'shore', islet: true }),
  // Made.
  S('flint flake', 'a razor-sharp chip knapped from flint', 1, '#5a606a'),
  S('sparks', 'a shower of hot sparks', 1, '#ffd34d'),
  S('cord', 'twisted plant fibre rope', 1, '#a89a5a', { floats: 'drifts' }),
  S('wet clay', 'clay worked with water, ready to shape', 1, '#9a5a40'),
  S('ember', 'smouldering tinder', 2, '#ff8a3a'),
  S('fire', 'a burning fire', 3, '#ff6a2a'),
  S('blade', 'a flint flake set in a wooden handle', 2, '#6a5040'),
  S('axe', 'a stone axe head lashed to a haft', 3, '#5a4a3a'),
  S('spear', 'a sharpened, fire-hardened shaft', 3, '#7a5a3a'),
  S('frame', 'branches lashed together with cord', 2, '#8a6a40', { floats: 'rolls' }),
  S('thatch', 'bundled dry grass for roofing', 2, '#c8b45a', { floats: 'drifts' }),
  S('mud brick', 'clay and grass pressed into a block', 2, '#9a6040'),
  S('pottery', 'a fired clay pot that holds water', 3, '#b0603a'),
  S('glass', 'sand melted into glass', 4, '#bfe8e8'),
  S('pitch', 'resin boiled into waterproof glue', 4, '#3a2a1a'),
  S('cooked fruit', 'fruit cooked over a fire', 4, '#c0602a', { food: 0.6, floats: 'drifts' }),
  S('raft', 'driftwood logs lashed to a frame', 3, '#b09070', { craft: 'raft' }),
  S('boat', 'a raft sealed with pitch, dry and steady', 5, '#6a4a2a', { craft: 'boat' }),
  S('obsidian blade', 'a long, glass-sharp edge struck from obsidian', 1, '#2a2632'),
  S('lime', 'burnt shell, a white powder', 4, '#f2f2ea'),
  S('hut', 'a frame thatched against rain and night', 3, '#a88a50', { structure: 'hut' }),
  S('wall', 'mud bricks stacked into a wall', 3, '#9a6040', { structure: 'tower' }),
  S('signal fire', 'a fire built high to be seen from far away', 4, '#ff5a1a', { structure: 'beacon' }),
  S('stone circle', 'stones set in a ring on the ground', 1, '#8f9399', { structure: 'ring' }),
];
const R = (a: string, b: string, product: string, struck = false): Reaction => ({ a, b, product, struck });
const REACTIONS: Reaction[] = [
  R('flint', 'flint', 'flint flake', true),         // knapping: strike flint
  R('flint', 'pyrite', 'sparks'),                    // flint on pyrite throws sparks
  R('plant fibre', 'plant fibre', 'cord'),           // twisting fibre makes rope
  R('clay', 'water', 'wet clay'),
  R('sparks', 'dry grass', 'ember'),                 // sparks catch in tinder
  R('ember', 'wood', 'fire'),
  R('ember', 'driftwood', 'fire'),
  R('flint flake', 'wood', 'blade'),
  R('blade', 'cord', 'axe'),
  R('wood', 'fire', 'spear'),                        // fire-hardened point
  R('cord', 'wood', 'frame'),
  R('dry grass', 'cord', 'thatch'),
  R('wet clay', 'dry grass', 'mud brick'),
  R('wet clay', 'fire', 'pottery'),
  R('sand', 'fire', 'glass'),
  R('resin', 'fire', 'pitch'),
  R('fruit', 'fire', 'cooked fruit'),
  R('shell', 'fire', 'lime'),                        // burning shell makes quicklime
  R('frame', 'thatch', 'hut'),
  R('mud brick', 'mud brick', 'wall'),
  R('fire', 'frame', 'signal fire'),
  R('stone', 'stone', 'stone circle'),
  R('frame', 'driftwood', 'raft'),                   // logs lashed to a frame float as a raft
  R('raft', 'pitch', 'boat'),                        // pitch caulks the seams: a sealed hull
  R('obsidian', 'obsidian', 'obsidian blade', true), // obsidian knaps like flint, but sharper
];

export function realWorldChemistry(): Chemistry {
  const substances: Substance[] = SPECS.map(([name, description, tier, colour, extra]) => ({ name, description, tier, colour, colourName: '', ...extra }));
  return { seed: 0, substances, reactions: REACTIONS.map(r => ({ ...r })) };
}
