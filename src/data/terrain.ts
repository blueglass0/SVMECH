/**
 * Terrain types: how tough each obstacle is, what it blocks, and how heavy a
 * unit must be to crush it by walking through. Infinity = never.
 * Tonnage to crush is compared with the chassis' weight class tonnage
 * (Vulture 50 t) or the enemy's `crushTonnage` (tanks 35 t).
 */
export type TerrainType = 'building' | 'wall' | 'rock' | 'shed' | 'fence' | 'tree' | 'barrier';

export interface TerrainDef {
  hp: number;
  /** Units at least this heavy crush it by walking into it. */
  crush: number;
  blocksShots: boolean;
  blocksSight: boolean;
  /** Explosive splash does this many times its damage to this terrain. */
  splashMultiplier: number;
  rubble: 'concrete' | 'wood' | 'foliage' | 'none';
  fill: number;
  edge: number;
}

export const TERRAIN: Record<TerrainType, TerrainDef> = {
  building: { hp: 600, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'concrete', fill: 0x2c353e, edge: 0x47535e },
  wall: { hp: 260, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'concrete', fill: 0x30363a, edge: 0x5a636b },
  rock: { hp: Infinity, crush: Infinity, blocksShots: true, blocksSight: true, splashMultiplier: 0, rubble: 'none', fill: 0x332f2a, edge: 0x544c42 },
  barrier: { hp: 380, crush: 75, blocksShots: true, blocksSight: false, splashMultiplier: 2, rubble: 'concrete', fill: 0x4b5157, edge: 0x7a838b },
  shed: { hp: 90, crush: 35, blocksShots: true, blocksSight: true, splashMultiplier: 3, rubble: 'wood', fill: 0x4a3b2c, edge: 0x7a6248 },
  tree: { hp: 45, crush: 30, blocksShots: true, blocksSight: true, splashMultiplier: 2, rubble: 'foliage', fill: 0x24381f, edge: 0x3a5e2f },
  fence: { hp: 25, crush: 20, blocksShots: false, blocksSight: false, splashMultiplier: 2, rubble: 'wood', fill: 0x6b5a45, edge: 0x8a7558 },
};

/** Rubble colours left behind. */
export const RUBBLE_COLORS = { concrete: 0x262c31, wood: 0x3a2f25, foliage: 0x1c2a19 };

/** Mechs slow down this much when they crush something (fraction of speed kept). */
export const CRUSH_SLOWDOWN = 0.85;

/** Default type for obstacles that don't name one. */
export function defaultTerrain(o: { kind: 'rect' | 'circle'; w?: number; h?: number }): TerrainType {
  if (o.kind === 'circle') return 'rock';
  return Math.min(o.w ?? 0, o.h ?? 0) < 60 ? 'wall' : 'building';
}
