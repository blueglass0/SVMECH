import type { Obstacle } from '../core/collision';

/**
 * Hand-made test arena for tuning movement (milestone 2): open ground, a
 * town block with alleys, rock fields and a narrow gap. Procedural maps
 * replace this in milestone 3.
 */
export const TEST_ARENA = {
  width: 3072,
  height: 3072,
  spawn: { x: 1536, y: 2600, angleDeg: -90 },
  colors: {
    ground: 0x161b20,
    gridMinor: 0x1f262d,
    gridMajor: 0x2b343d,
    border: 0xe8a33d,
    building: 0x2c353e,
    buildingEdge: 0x47535e,
    rock: 0x332f2a,
    rockEdge: 0x544c42,
  },
  obstacles: [
    // Town block: a grid of buildings with alleys of different widths.
    { kind: 'rect', x: 1000, y: 800, w: 220, h: 160 },
    { kind: 'rect', x: 1320, y: 800, w: 160, h: 160 },
    { kind: 'rect', x: 1560, y: 800, w: 300, h: 120 },
    { kind: 'rect', x: 1000, y: 1060, w: 140, h: 240 },
    { kind: 'rect', x: 1240, y: 1100, w: 260, h: 200 },
    { kind: 'rect', x: 1620, y: 1020, w: 120, h: 280 },
    { kind: 'rect', x: 1840, y: 1080, w: 200, h: 160 },
    { kind: 'rect', x: 1100, y: 1420, w: 380, h: 100 },
    { kind: 'rect', x: 1600, y: 1420, w: 160, h: 160 },
    // Long wall with a narrow gap (85 units; a mech is 60 across).
    { kind: 'rect', x: 400, y: 1900, w: 900, h: 50 },
    { kind: 'rect', x: 1385, y: 1900, w: 700, h: 50 },
    // Walls to drive along and test sliding.
    { kind: 'rect', x: 2350, y: 500, w: 60, h: 900 },
    { kind: 'rect', x: 300, y: 500, w: 500, h: 60 },
    // Rock field (east).
    { kind: 'circle', x: 2300, y: 1800, r: 70 },
    { kind: 'circle', x: 2480, y: 1950, r: 45 },
    { kind: 'circle', x: 2650, y: 1760, r: 90 },
    { kind: 'circle', x: 2420, y: 2200, r: 60 },
    { kind: 'circle', x: 2700, y: 2150, r: 50 },
    { kind: 'circle', x: 2560, y: 2420, r: 80 },
    // Scattered cover near the spawn.
    { kind: 'circle', x: 1250, y: 2450, r: 40 },
    { kind: 'circle', x: 1850, y: 2350, r: 55 },
    { kind: 'rect', x: 800, y: 2500, w: 120, h: 120 },
    { kind: 'rect', x: 2100, y: 2600, w: 200, h: 60 },
    // Rock field (west).
    { kind: 'circle', x: 500, y: 1100, r: 60 },
    { kind: 'circle', x: 650, y: 1300, r: 40 },
    { kind: 'circle', x: 420, y: 1450, r: 75 },
  ] as Obstacle[],
};
