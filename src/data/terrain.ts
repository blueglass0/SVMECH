/**
 * Terrain types: how tough each obstacle is, what it blocks, and how heavy a
 * unit must be to crush it by walking through. Infinity = never.
 * Tonnage to crush is compared with the chassis' weight class tonnage
 * (Vulture 50 t) or the enemy's `crushTonnage` (tanks 35 t).
 */
export type TerrainType = 'building' | 'lightBuilding' | 'wall' | 'rock' | 'shed' | 'fence' | 'tree' | 'barrier' | 'sandbags';

export interface TerrainDef {
  hp: number;
  /** Units at least this heavy crush it by walking into it. */
  crush: number;
  blocksShots: boolean;
  blocksSight: boolean;
  /** Explosive splash does this many times its damage to this terrain. */
  splashMultiplier: number;
  rubble: 'concrete' | 'wood' | 'foliage' | 'none';
  /** How much crushing it slows a mech (1 = a tree). */
  crushDrag: number;
  fill: number;
  edge: number;
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  building: { hp: 600, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'concrete', crushDrag: 0, fill: 0x2c353e, edge: 0x47535e },
  lightBuilding: { hp: 240, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'concrete', crushDrag: 0, fill: 0x343a35, edge: 0x58615a },
  wall: { hp: 260, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'concrete', crushDrag: 0, fill: 0x30363a, edge: 0x5a636b },
  rock: { hp: Infinity, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 0, rubble: 'none', crushDrag: 0, fill: 0x332f2a, edge: 0x544c42 },
  barrier: { hp: 380, crush: 70, blocksShots: true, blocksSight: false, splashMultiplier: 2, rubble: 'concrete', crushDrag: 2, fill: 0x4b5157, edge: 0x7a838b },
  sandbags: { hp: 110, crush: 60, blocksShots: true, blocksSight: false, splashMultiplier: 3, rubble: 'wood', crushDrag: 1.5, fill: 0x5e5440, edge: 0x837557 },
  shed: { hp: 90, crush: 35, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'wood', crushDrag: 1.4, fill: 0x4a3b2c, edge: 0x7a6248 },
  tree: { hp: 45, crush: 30, blocksShots: true, blocksSight: true, splashMultiplier: 2, rubble: 'foliage', crushDrag: 1, fill: 0x24381f, edge: 0x3a5e2f },
  fence: { hp: 25, crush: 20, blocksShots: false, blocksSight: false, splashMultiplier: 2, rubble: 'wood', crushDrag: 0.4, fill: 0x6b5a45, edge: 0x8a7558 },
};

/** Rubble colours left behind. */
export const RUBBLE_COLORS = { concrete: 0x262c31, wood: 0x3a2f25, foliage: 0x1c2a19 };

/**
 * Crushing slows a mech: it keeps `1 - CRUSH_SLOWDOWN × drag × (50 / tonnage)` of its
 * speed per thing crushed. A 50 t mech crushing a tree keeps 70%; a 90 t mech ~83%;
 * a 30 t mech ~50%.
 */
export const CRUSH_SLOWDOWN = 0.3;

/** Default type for obstacles that don't name one. */
export function defaultTerrain(o: { kind: 'rect' | 'circle'; w?: number; h?: number }): TerrainType {
  if (o.kind === 'circle') return 'rock';
  return Math.min(o.w ?? 0, o.h ?? 0) < 60 ? 'wall' : 'building';
}
