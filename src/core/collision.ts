import type { Vec } from './math';

/** Static obstacles. Rects are axis-aligned, with x/y at the top-left corner. */
export type Obstacle =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number };

export interface Bounds {
  width: number;
  height: number;
}

/**
 * Push a circle out of every obstacle and back inside the map. Mutates `pos`.
 * Returns true if anything was hit. Two passes handle corners and gaps.
 */
export function resolveCircle(pos: Vec, r: number, obstacles: readonly Obstacle[], bounds: Bounds): boolean {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      if (o.kind === 'circle') {
        const dx = pos.x - o.x;
        const dy = pos.y - o.y;
        const min = r + o.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.0001;
        pos.x = o.x + (dx / d) * min;
        pos.y = o.y + (dy / d) * min;
        hit = true;
      } else {
        // Quick reject on the expanded box.
        if (pos.x < o.x - r || pos.x > o.x + o.w + r || pos.y < o.y - r || pos.y > o.y + o.h + r) continue;
        const cx = Math.max(o.x, Math.min(pos.x, o.x + o.w));
        const cy = Math.max(o.y, Math.min(pos.y, o.y + o.h));
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0) {
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.y = cy + (dy / d) * r;
        } else {
          // Centre is inside the rect: leave by the nearest side.
          const left = pos.x - o.x;
          const right = o.x + o.w - pos.x;
          const top = pos.y - o.y;
          const bottom = o.y + o.h - pos.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) pos.x = o.x - r;
          else if (m === right) pos.x = o.x + o.w + r;
          else if (m === top) pos.y = o.y - r;
          else pos.y = o.y + o.h + r;
        }
        hit = true;
      }
    }
  }
  const x = Math.max(r, Math.min(pos.x, bounds.width - r));
  const y = Math.max(r, Math.min(pos.y, bounds.height - r));
  if (x !== pos.x || y !== pos.y) {
    pos.x = x;
    pos.y = y;
    hit = true;
  }
  return hit;
}
