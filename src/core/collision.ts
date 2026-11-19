import type { Vec } from './math';

/** Static obstacles. Rects are axis-aligned, with x/y at the top-left corner. */
export type Obstacle =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number };

/** A moving or destructible body that also blocks movement (tanks, turrets, the player). */
export interface Circle {
  x: number;
  y: number;
  radius: number;
}

const CELL = 160;

/**
 * Static collision for one map. Obstacles are bucketed into a uniform grid so
 * movement, bullets and line-of-sight checks only test nearby obstacles.
 */
export class CollisionWorld {
  readonly cols: number;
  readonly rows: number;
  private cells: number[][];
  /** Per-obstacle query stamp, to test each obstacle once per query. */
  private stamps: Uint32Array;
  private stamp = 0;
  private near: number[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
    readonly obstacles: readonly Obstacle[],
  ) {
    this.cols = Math.ceil(width / CELL);
    this.rows = Math.ceil(height / CELL);
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.stamps = new Uint32Array(obstacles.length);
    obstacles.forEach((o, i) => {
      const [x0, y0, x1, y1] = bounds(o);
      this.forCells(x0, y0, x1, y1, (c) => this.cells[c].push(i));
    });
  }

  /** Push a circle out of obstacles, other bodies and the map edge. Mutates `pos`. True if anything was hit. */
  resolveCircle(pos: Vec, r: number, bodies?: readonly Circle[], self?: Circle): boolean {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const near = this.query(pos.x - r, pos.y - r, pos.x + r, pos.y + r);
      for (const i of near) {
        if (pushOut(pos, r, this.obstacles[i])) hit = true;
      }
      if (bodies) {
        for (const b of bodies) {
          if (b === self) continue;
          const dx = pos.x - b.x;
          const dy = pos.y - b.y;
          const min = r + b.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.0001;
          pos.x = b.x + (dx / d) * min;
          pos.y = b.y + (dy / d) * min;
          hit = true;
        }
      }
    }
    const x = Math.max(r, Math.min(pos.x, this.width - r));
    const y = Math.max(r, Math.min(pos.y, this.height - r));
    if (x !== pos.x || y !== pos.y) {
      pos.x = x;
      pos.y = y;
      hit = true;
    }
    return hit;
  }

  /** Does a circle overlap any obstacle or leave the map? */
  circleBlocked(x: number, y: number, r: number): boolean {
    if (x < r || y < r || x > this.width - r || y > this.height - r) return true;
    for (const i of this.query(x - r, y - r, x + r, y + r)) {
      const o = this.obstacles[i];
      if (o.kind === 'circle') {
        if (Math.hypot(x - o.x, y - o.y) < r + o.r) return true;
      } else {
        const cx = Math.max(o.x, Math.min(x, o.x + o.w));
        const cy = Math.max(o.y, Math.min(y, o.y + o.h));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  /** Fraction (0..1) along the segment where it first hits an obstacle, or -1 if clear. */
  raycast(x0: number, y0: number, x1: number, y1: number): number {
    let best = -1;
    const near = this.query(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
    for (const i of near) {
      const o = this.obstacles[i];
      const t = o.kind === 'rect' ? segmentRect(x0, y0, x1, y1, o) : segmentCircle(x0, y0, x1, y1, o.x, o.y, o.r);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }

  lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    return this.raycast(x0, y0, x1, y1) < 0;
  }

  /** Obstacle indices whose cells touch the box. The returned array is reused. */
  private query(x0: number, y0: number, x1: number, y1: number): number[] {
    const out = this.near;
    out.length = 0;
    const stamp = ++this.stamp;
    // Inlined cell walk: this runs for every bullet every frame, so no closures.
    const cx0 = Math.max(0, Math.floor(x0 / CELL));
    const cy0 = Math.max(0, Math.floor(y0 / CELL));
    const cx1 = Math.min(this.cols - 1, Math.floor(x1 / CELL));
    const cy1 = Math.min(this.rows - 1, Math.floor(y1 / CELL));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        for (const i of this.cells[cy * this.cols + cx]) {
          if (this.stamps[i] !== stamp) {
            this.stamps[i] = stamp;
            out.push(i);
          }
        }
      }
    }
    return out;
  }

  private forCells(x0: number, y0: number, x1: number, y1: number, fn: (cell: number) => void): void {
    const cx0 = Math.max(0, Math.floor(x0 / CELL));
    const cy0 = Math.max(0, Math.floor(y0 / CELL));
    const cx1 = Math.min(this.cols - 1, Math.floor(x1 / CELL));
    const cy1 = Math.min(this.rows - 1, Math.floor(y1 / CELL));
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) fn(cy * this.cols + cx);
    }
  }
}

function bounds(o: Obstacle): [number, number, number, number] {
  return o.kind === 'rect' ? [o.x, o.y, o.x + o.w, o.y + o.h] : [o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r];
}

function pushOut(pos: Vec, r: number, o: Obstacle): boolean {
  if (o.kind === 'circle') {
    const dx = pos.x - o.x;
    const dy = pos.y - o.y;
    const min = r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2) || 0.0001;
    pos.x = o.x + (dx / d) * min;
    pos.y = o.y + (dy / d) * min;
    return true;
  }
  if (pos.x < o.x - r || pos.x > o.x + o.w + r || pos.y < o.y - r || pos.y > o.y + o.h + r) return false;
  const cx = Math.max(o.x, Math.min(pos.x, o.x + o.w));
  const cy = Math.max(o.y, Math.min(pos.y, o.y + o.h));
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > 0) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.y = cy + (dy / d) * r;
    return true;
  }
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
  return true;
}

/** Segment vs axis-aligned rect (slab method). Fraction of first contact, or -1. */
function segmentRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  o: { x: number; y: number; w: number; h: number },
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < o.x || x0 > o.x + o.w) return -1;
  } else {
    let t1 = (o.x - x0) / dx;
    let t2 = (o.x + o.w - x0) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y0 < o.y || y0 > o.y + o.h) return -1;
  } else {
    let t1 = (o.y - y0) / dy;
    let t2 = (o.y + o.h - y0) / dy;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Segment vs circle. Fraction of first contact (0 if the start is inside), or -1. */
export function segmentCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
