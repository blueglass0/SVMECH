import type { CollisionWorld } from '../../core/collision';
import type { Vec } from '../../core/math';

const CELL = 40;
const SQRT2 = Math.SQRT2;

/**
 * Coarse walkability grid with A* pathfinding, for tanks. Cells are blocked
 * where a unit of the given clearance radius wouldn't fit.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  private blocked: Uint8Array;
  // Search scratch, reused across searches.
  private g: Float32Array;
  private parent: Int32Array;
  private seen: Uint32Array;
  private closed: Uint32Array;
  private search = 0;
  private heap: number[] = [];
  private f: Float32Array;

  constructor(world: CollisionWorld, clearance: number) {
    this.cols = Math.ceil(world.width / CELL);
    this.rows = Math.ceil(world.height / CELL);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (world.circleBlocked((c + 0.5) * CELL, (r + 0.5) * CELL, clearance)) this.blocked[r * this.cols + c] = 1;
      }
    }
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Find a path; fills `out` with waypoints (world coords, excluding the start). False if none. */
  findPath(sx: number, sy: number, tx: number, ty: number, out: Vec[]): boolean {
    out.length = 0;
    const start = this.nearestFree(this.cellAt(sx, sy));
    const goal = this.nearestFree(this.cellAt(tx, ty));
    if (start < 0 || goal < 0) return false;
    const id = ++this.search;
    const cols = this.cols;
    const gx = goal % cols;
    const gy = (goal / cols) | 0;
    const h = (c: number) => {
      const dx = Math.abs((c % cols) - gx);
      const dy = Math.abs(((c / cols) | 0) - gy);
      return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
    };
    const heap = this.heap;
    heap.length = 0;
    this.seen[start] = id;
    this.g[start] = 0;
    this.f[start] = h(start);
    this.parent[start] = -1;
    this.push(start);
    let found = false;
    let expanded = 0;
    while (heap.length > 0 && expanded < 4000) {
      const cur = this.pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      expanded++;
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= this.rows) continue;
          const n = ny * cols + nx;
          if (this.blocked[n]) continue;
          // No cutting corners past blocked cells.
          if (dx !== 0 && dy !== 0 && (this.blocked[cy * cols + nx] || this.blocked[ny * cols + cx])) continue;
          const ng = this.g[cur] + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
          if (this.seen[n] === id && ng >= this.g[n]) continue;
          this.seen[n] = id;
          this.g[n] = ng;
          this.f[n] = ng + h(n);
          this.parent[n] = cur;
          this.push(n);
        }
      }
    }
    if (!found) return false;

    // Walk back, then keep only the waypoints needed to steer around obstacles.
    const cells: number[] = [];
    for (let c = goal; c !== -1 && c !== start; c = this.parent[c]) cells.push(c);
    cells.reverse();
    let from = start;
    for (let i = 0; i < cells.length; i++) {
      const next = cells[i + 1];
      if (next === undefined || !this.clearLine(from, next)) {
        out.push({ x: (cells[i] % cols + 0.5) * CELL, y: (((cells[i] / cols) | 0) + 0.5) * CELL });
        from = cells[i];
      }
    }
    if (out.length > 0) {
      out[out.length - 1].x = tx;
      out[out.length - 1].y = ty;
    }
    return true;
  }

  private cellAt(x: number, y: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / CELL)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return r * this.cols + c;
  }

  private nearestFree(cell: number): number {
    if (!this.blocked[cell]) return cell;
    const cx = cell % this.cols;
    const cy = (cell / this.cols) | 0;
    for (let ring = 1; ring < 8; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const n = ny * this.cols + nx;
          if (!this.blocked[n]) return n;
        }
      }
    }
    return -1;
  }

  /** Grid line walk between two cells: true if every cell along it is free. */
  private clearLine(a: number, b: number): boolean {
    const cols = this.cols;
    let x0 = a % cols;
    let y0 = (a / cols) | 0;
    const x1 = b % cols;
    const y1 = (b / cols) | 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (this.blocked[y0 * cols + x0]) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      const stepX = e2 >= dy;
      const stepY = e2 <= dx;
      // A diagonal step must not squeeze between two blocked cells.
      if (stepX && stepY && (this.blocked[y0 * cols + x0 + sx] || this.blocked[(y0 + sy) * cols + x0])) return false;
      if (stepX) {
        err += dy;
        x0 += sx;
      }
      if (stepY) {
        err += dx;
        y0 += sy;
      }
    }
  }

  // Binary min-heap on f.
  private push(n: number): void {
    const h = this.heap;
    const f = this.f;
    h.push(n);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[h[p]] <= f[n]) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = n;
  }

  private pop(): number {
    const h = this.heap;
    const f = this.f;
    const top = h[0];
    const last = h.pop()!;
    if (h.length > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= h.length) break;
        const r = l + 1;
        const c = r < h.length && f[h[r]] < f[h[l]] ? r : l;
        if (f[h[c]] >= f[last]) break;
        h[i] = h[c];
        i = c;
      }
      h[i] = last;
    }
    return top;
  }
}
