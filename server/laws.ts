// The island's laws for Sandbox v1. Recipes are hidden from the minds:
// they must be discovered by trying.
export const ITEMS = ['stone', 'shell', 'wood', 'fibre', 'fruit', 'flint'] as const;
export type Item = typeof ITEMS[number] | string;
export const LAWS = [
  'Things can be gathered only where they exist: stone and shells on the shore, wood, fibre and fruit under trees, flint high on the rocks.',
  'You can carry six things.',
  'Two things you carry may be combined. Some pairs make something new; most do nothing.',
  'Words carry only a short distance; others hear you only if they are near.',
];
export const RECIPES: Array<[string, string, string]> = [
  ['stone', 'wood', 'hammer'],
  ['flint', 'wood', 'axe'],
  ['fibre', 'fibre', 'cord'],
  ['cord', 'wood', 'frame'],
  ['shell', 'cord', 'necklace'],
  ['flint', 'stone', 'spark'],
  ['spark', 'wood', 'fire'],
  ['fruit', 'fire', 'cooked fruit'],
  ['frame', 'fibre', 'shelter'],
];
/** Applies a combine to the inventory in place. Returns undefined when the
 * agent lacks the items, 'nothing' when the pair is inert, else the product. */
export function combine(inventory: Item[], a: Item, b: Item): Item | 'nothing' | undefined {
  const i = inventory.indexOf(a);
  if (i < 0) return undefined;
  const rest = [...inventory]; rest.splice(i, 1);
  const j = rest.indexOf(b);
  if (j < 0) return undefined;
  const recipe = RECIPES.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  if (!recipe) return 'nothing';
  rest.splice(j, 1); rest.push(recipe[2]);
  inventory.splice(0, inventory.length, ...rest);
  return recipe[2];
}
