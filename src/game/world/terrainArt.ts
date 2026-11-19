import type Phaser from 'phaser';
import type { Obstacle } from '../../core/collision';
import { RUBBLE_COLORS, type TerrainDef } from '../../data/terrain';
import { Rng } from '../../core/rng';

/**
 * Draws one obstacle into a chunk's Graphics. `stage`: 0 intact, 1 damaged,
 * 2 badly damaged, 3 destroyed (rubble). Redrawn only when the stage changes.
 */
export function drawTerrain(g: Phaser.GameObjects.Graphics, o: Obstacle, t: TerrainDef, stage: number, seed: number): void {
  const rng = new Rng(seed * 7919 + 17);
  if (stage >= 3) {
    drawRubble(g, o, t, rng);
    return;
  }
  const type = o.type;
  if (o.kind === 'circle') {
    g.fillStyle(t.fill).fillCircle(o.x, o.y, o.r);
    g.lineStyle(type === 'tree' ? 2 : 3, t.edge).strokeCircle(o.x, o.y, o.r);
    if (type === 'tree') g.fillStyle(t.edge, 0.5).fillCircle(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.45);
    return;
  }
  g.fillStyle(t.fill).fillRect(o.x, o.y, o.w, o.h);
  g.lineStyle(type === 'fence' ? 1.5 : type === 'shed' ? 2 : 3, t.edge).strokeRect(o.x, o.y, o.w, o.h);
  if (type === 'building') {
    // Roof detail so buildings read as solid blocks.
    const inset = Math.min(14, o.w / 4, o.h / 4);
    g.lineStyle(1.5, t.edge, 0.5).strokeRect(o.x + inset, o.y + inset, o.w - inset * 2, o.h - inset * 2);
  } else if (type === 'shed') {
    // Roof ridge.
    if (o.w > o.h) g.lineStyle(1.5, t.edge, 0.7).lineBetween(o.x, o.y + o.h / 2, o.x + o.w, o.y + o.h / 2);
    else g.lineStyle(1.5, t.edge, 0.7).lineBetween(o.x + o.w / 2, o.y, o.x + o.w / 2, o.y + o.h);
  }
  if (stage >= 1) {
    // Cracks, more at stage 2, plus scorched patches.
    g.lineStyle(1.5, 0x0d0f10, 0.8);
    for (let i = 0; i < stage * 3; i++) {
      let x = o.x + rng.range(0.1, 0.9) * o.w;
      let y = o.y + rng.range(0.1, 0.9) * o.h;
      for (let k = 0; k < 3; k++) {
        const nx = Math.max(o.x, Math.min(o.x + o.w, x + rng.range(-14, 14)));
        const ny = Math.max(o.y, Math.min(o.y + o.h, y + rng.range(-14, 14)));
        g.lineBetween(x, y, nx, ny);
        x = nx;
        y = ny;
      }
    }
    if (stage >= 2) {
      g.fillStyle(0x0d0f10, 0.35);
      for (let i = 0; i < 3; i++) {
        g.fillCircle(o.x + rng.range(0.2, 0.8) * o.w, o.y + rng.range(0.2, 0.8) * o.h, Math.min(o.w, o.h) * rng.range(0.12, 0.25));
      }
    }
  }
}

function drawRubble(g: Phaser.GameObjects.Graphics, o: Obstacle, t: TerrainDef, rng: Rng): void {
  if (t.rubble === 'none') return;
  const color = RUBBLE_COLORS[t.rubble];
  const [x0, y0, w, h] = o.kind === 'rect' ? [o.x, o.y, o.w, o.h] : [o.x - o.r, o.y - o.r, o.r * 2, o.r * 2];
  if (o.type === 'tree') {
    // Stump and scattered foliage.
    g.fillStyle(color, 0.8);
    for (let i = 0; i < 4; i++) g.fillCircle(x0 + rng.range(0, w), y0 + rng.range(0, h), rng.range(3, 7));
    g.fillStyle(0x4a3b2c).fillCircle(o.x, o.y, 4);
    return;
  }
  // Low outline of the old footprint, then chunks of debris.
  g.fillStyle(color, 0.55).fillRect(x0, y0, w, h);
  const pieces = Math.min(40, Math.max(3, Math.round((w * h) / 500)));
  g.fillStyle(color, 1);
  for (let i = 0; i < pieces; i++) {
    const s = rng.range(4, Math.min(14, Math.max(5, Math.min(w, h) / 2)));
    g.fillRect(x0 + rng.range(0, w - s), y0 + rng.range(0, h - s), s, s * rng.range(0.5, 1));
  }
  g.lineStyle(1, 0x47535e, 0.35).strokeRect(x0, y0, w, h);
}

/** Damage stage from hit points left. */
export function terrainStage(hp: number, maxHp: number, alive: boolean): number {
  if (!alive) return 3;
  if (!Number.isFinite(maxHp)) return 0;
  const f = hp / maxHp;
  return f < 0.33 ? 2 : f < 0.66 ? 1 : 0;
}
