import type { Obstacle } from '../../core/collision';
import { Rng } from '../../core/rng';
import type { Vec } from '../../core/math';
import { DEFEND, DESTROY_TARGETS, ESCORT, HUNT, MAP_SIZES, RAID, type MapSize, type MissionType } from '../../data/missions';
import type { CombatDifficulty } from '../../data/difficulty';
import { ECONOMY } from '../../data/economy';

export interface Placement {
  type: string;
  x: number;
  y: number;
  angle: number;
  /** Tanks: where they guard or patrol around. */
  home?: Vec;
  /** Mission role: the hunted ace, or a convoy escort. */
  role?: 'ace' | 'escort';
}

/** Drone flights and enemy mechs on the map (rolled with the contract, milestone 8). */
export interface MissionForces {
  /** Enemy mech types (EnemyDef ids), one entry per mech. */
  mechs: readonly string[];
  droneFlights: number;
  /** The enemy army's tank and turret mix (milestone 9); defaults to the faction-neutral army. */
  tankTypes?: readonly { type: string; weight: number }[];
  turretTypes?: readonly string[];
  /** Mech hunt: the ace's mech type. */
  ace?: string;
  /** Convoy raid: escort vehicles riding with the convoy. */
  escorts?: number;
}

export interface MapOptions {
  mission: MissionType;
  /** Destroy: uplinks to place. */
  targets: number;
  forces: MissionForces;
  size: MapSize;
}

export interface MissionMap {
  seed: number;
  width: number;
  height: number;
  obstacles: Obstacle[];
  spawn: { x: number; y: number; angle: number };
  targets: Placement[];
  turrets: Placement[];
  tanks: Placement[];
  /** Drones and enemy mechs (placed like tanks, created by `createEnemy`). */
  units: Placement[];
  mission: MissionType;
  /** Bases / outposts (uplinks sit in the middle of these on destroy missions). */
  sites: Vec[];
  /** Convoy raid / escort: where the convoy starts and where its road ends. */
  convoy?: { start: Vec; end: Vec };
  /** Defend: the generators to hold, and where attack waves come in. */
  defense?: { center: Vec; generators: Vec[]; waveSpawns: Vec[] };
  /** Field stations: ammo depot, repair bay, swap station. */
  stations: { type: StationType; x: number; y: number }[];
}

export type StationType = 'ammo' | 'repair' | 'swap';
/** Stations need this much open ground around them. */
export const STATION_RADIUS = 70;

type Box = [number, number, number, number];

/**
 * Generate a destroy-targets map from a seed. Every obstacle keeps at least
 * `minGap` from every other obstacle and from the map edge, so all open
 * ground is connected and reachable by the mech and by tanks.
 */
export function generateDestroyTargets(
  seed: number,
  difficulty: CombatDifficulty,
  targetCount: number = DESTROY_TARGETS.targets,
  forces: MissionForces = { mechs: [], droneFlights: 0 },
): MissionMap {
  return generateMap(seed, difficulty, { mission: 'destroy', targets: targetCount, forces, size: 'standard' });
}

/**
 * Generate a mission map from a seed. Every mission type shares the terrain generator;
 * they differ in what sits at the sites (uplinks, outposts) and in mission extras
 * (the hunted ace, the convoy road). Large maps scale obstacle counts with the area.
 */
export function generateMap(seed: number, difficulty: CombatDifficulty, opts: MapOptions): MissionMap {
  const T = DESTROY_TARGETS;
  const M = T.map;
  const forces = opts.forces;
  const rng = new Rng(seed);
  const scale = MAP_SIZES[opts.size].scale;
  const area = scale * scale;
  const W = Math.round(M.width * scale);
  const H = Math.round(M.height * scale);
  const gap = M.minGap;
  /** A count range scaled to the map's area. */
  const count = (r: readonly [number, number] | readonly number[]) => rng.int(Math.round(r[0] * area), Math.round(r[1] * area));

  const spawn = { x: rng.range(700, W - 700), y: H - 260, angle: -Math.PI / 2 };

  // Convoy raid: the road runs from one side of the map to the other, across the far half.
  let convoy: MissionMap['convoy'];
  if (opts.mission === 'raid') {
    const left = { x: gap + 140, y: rng.range(H * 0.15, H * 0.5) };
    const right = { x: W - gap - 140, y: rng.range(H * 0.15, H * 0.5) };
    convoy = rng.next() < 0.5 ? { start: left, end: right } : { start: right, end: left };
  }
  // Escort: our convoy starts beside the drop point and drives to the far edge.
  if (opts.mission === 'escort') {
    const side = rng.next() < 0.5 ? -1 : 1;
    const start = { x: Math.max(gap + 160, Math.min(W - gap - 160, spawn.x + side * 260)), y: spawn.y - 140 };
    convoy = { start, end: { x: rng.range(W * 0.2, W * 0.8), y: gap + 140 } };
  }
  // Defend: a base of generators above the drop point; waves come in from the far edges.
  let defense: MissionMap['defense'];
  if (opts.mission === 'defend') {
    const center = { x: spawn.x, y: spawn.y - DEFEND.baseOffset * scale };
    const generators: Vec[] = [];
    for (let i = 0; i < DEFEND.generators; i++) {
      const a = -Math.PI / 2 + (i / DEFEND.generators) * Math.PI * 2;
      generators.push({ x: center.x + Math.cos(a) * 150, y: center.y + Math.sin(a) * 150 });
    }
    const waveSpawns = [
      { x: rng.range(W * 0.2, W * 0.8), y: gap + 160 },
      { x: gap + 160, y: rng.range(H * 0.12, H * 0.45) },
      { x: W - gap - 160, y: rng.range(H * 0.12, H * 0.45) },
    ];
    defense = { center, generators, waveSpawns };
  }
  // Ground kept clear of obstacles: sites, the convoy road's ends, the defended base, wave entries.
  const reserved: Vec[] = convoy ? [convoy.start, convoy.end] : [];
  if (defense) reserved.push(defense.center, ...defense.generators, ...defense.waveSpawns);

  // Sites (uplink bases or outposts): far from the drop point and from each other. Escort
  // ambushes sit beside the road instead; defend missions have none.
  const siteCount = { destroy: opts.targets, hunt: HUNT.outposts, raid: RAID.outposts, defend: 0, escort: 0 }[opts.mission];
  const sites: Vec[] = [];
  if (opts.mission === 'escort' && convoy) {
    const { start, end } = convoy;
    const len = dist(start, end);
    const nx = -(end.y - start.y) / len;
    const ny = (end.x - start.x) / len;
    for (let i = 0; i < ESCORT.ambushes; i++) {
      const t = 0.3 + (i / Math.max(1, ESCORT.ambushes - 1)) * 0.5;
      const off = (rng.next() < 0.5 ? -1 : 1) * rng.range(260, 380);
      sites.push({
        x: Math.max(350, Math.min(W - 350, start.x + (end.x - start.x) * t + nx * off)),
        y: Math.max(350, Math.min(H - 350, start.y + (end.y - start.y) * t + ny * off)),
      });
    }
  }
  for (let attempt = 0; sites.length < siteCount && attempt < 3000; attempt++) {
    const minApart = (attempt < 1000 ? 850 : 600) * scale;
    const p = { x: rng.range(350, W - 350), y: rng.range(350, H * 0.7) };
    if (dist(p, spawn) < T.targetMinDistance * scale) continue;
    if (sites.some((s) => dist(s, p) < minApart)) continue;
    if (reserved.some((r) => dist(r, p) < 600)) continue;
    sites.push(p);
  }
  reserved.push(...sites);

  const obstacles: Obstacle[] = [];
  // Field stations are placed after the main solids; anything placed later keeps clear of them.
  const stations: MissionMap['stations'] = [];
  const keepClear = (o: Obstacle): boolean => {
    const b = box(o);
    if (b[0] < gap || b[1] < gap || b[2] > W - gap || b[3] > H - gap) return false;
    if (boxCircleDistance(b, spawn) < T.spawnClearance) return false;
    if (reserved.some((s) => boxCircleDistance(b, s) < 260)) return false;
    if (stations.some((s) => boxCircleDistance(b, s) < STATION_RADIUS + 30)) return false;
    return obstacles.every((other) => separation(o, other) >= gap);
  };
  const tryAdd = (o: Obstacle): boolean => {
    if (!keepClear(o)) return false;
    obstacles.push(o);
    return true;
  };
  /** Try a few random placements before giving up on an obstacle. */
  const place = (make: () => Obstacle) => {
    for (let attempt = 0; attempt < 8; attempt++) if (tryAdd(make())) return;
  };

  // Towns: grids of buildings with alleys.
  for (let t = count(M.towns); t > 0; t--) {
    const cols = rng.int(2, 4);
    const rows = rng.int(2, 3);
    const pitch = rng.range(290, 340);
    const ox = rng.range(gap, W - gap - cols * pitch);
    const oy = rng.range(gap, H - gap - rows * pitch);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng.next() < 0.2) continue;
        const w = rng.range(110, pitch - gap - 10);
        const h = rng.range(110, pitch - gap - 10);
        tryAdd({ kind: 'rect', x: ox + c * pitch, y: oy + r * pitch, w, h, type: 'building' });
      }
    }
  }

  // Rock fields.
  for (let f = count(M.rockFields); f > 0; f--) {
    const cx = rng.range(300, W - 300);
    const cy = rng.range(300, H - 300);
    for (let n = rng.int(5, 9); n > 0; n--) {
      place(() => ({ kind: 'circle', x: cx + rng.range(-300, 300), y: cy + rng.range(-300, 300), r: rng.range(28, 85), type: 'rock' }));
    }
  }

  // Long walls.
  for (let n = count(M.walls); n > 0; n--) {
    place(() => {
      const len = rng.range(240, 650);
      const thick = rng.range(36, 56);
      const x = rng.range(gap, W - gap - len);
      const y = rng.range(gap, H - gap - len);
      return rng.next() < 0.5 ? { kind: 'rect', x, y, w: len, h: thick, type: 'wall' } : { kind: 'rect', x, y, w: thick, h: len, type: 'wall' };
    });
  }

  // Scattered cover.
  for (let n = count(M.scatter); n > 0; n--) {
    place(() => {
      const x = rng.range(gap, W - gap);
      const y = rng.range(gap, H - gap);
      return rng.next() < 0.5
        ? { kind: 'circle', x, y, r: rng.range(25, 50), type: 'rock' }
        : { kind: 'rect', x, y, w: rng.range(60, 140), h: rng.range(60, 100), type: 'lightBuilding' };
    });
  }

  // Concrete barriers: solid for medium mechs, so they keep the minimum gap like everything above.
  for (let n = count(M.barriers); n > 0; n--) {
    place(() => {
      const along = rng.next() < 0.5;
      return { kind: 'rect', x: rng.range(gap, W - gap), y: rng.range(gap, H - gap), w: along ? 72 : 22, h: along ? 22 : 72, type: 'barrier' };
    });
  }

  // Field stations: in the open, away from the drop point, the bases and each other.
  const F = ECONOMY.field;
  for (let n = rng.int(F.stationsPerMap[0], F.stationsPerMap[1]); n > 0; n--) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const p = { x: rng.range(300, W - 300), y: rng.range(300, H - 300) };
      if (dist(p, spawn) < 700 || reserved.some((s) => dist(s, p) < 600) || stations.some((s) => dist(s, p) < 900)) continue;
      if (obstacles.some((o) => boxCircleDistance(box(o), p) < STATION_RADIUS + 30)) continue;
      const type: StationType = rng.next() < F.swapChance ? 'swap' : rng.next() < 0.5 ? 'ammo' : 'repair';
      stations.push({ type, ...p });
      break;
    }
  }

  // Props: trees, fences and sheds. Everything can crush them, so they don't need the gap rule;
  // they just mustn't overlap solid obstacles, the drop point or the bases.
  const solids = obstacles.length;
  const propClear = (o: Obstacle): boolean => {
    const b = box(o);
    if (b[0] < 20 || b[1] < 20 || b[2] > W - 20 || b[3] > H - 20) return false;
    if (boxCircleDistance(b, spawn) < 200) return false;
    if (reserved.some((s) => boxCircleDistance(b, s) < 230)) return false;
    if (stations.some((s) => boxCircleDistance(b, s) < STATION_RADIUS + 20)) return false;
    for (let i = 0; i < obstacles.length; i++) if (separation(o, obstacles[i]) < (i < solids ? 10 : 4)) return false;
    return true;
  };
  const addProp = (o: Obstacle) => {
    if (propClear(o)) obstacles.push(o);
  };
  for (let f = count(M.forests); f > 0; f--) {
    const cx = rng.range(200, W - 200);
    const cy = rng.range(200, H - 200);
    for (let n = rng.int(10, 20); n > 0; n--) {
      addProp({ kind: 'circle', x: cx + rng.range(-220, 220), y: cy + rng.range(-220, 220), r: rng.range(13, 22), type: 'tree' });
    }
  }
  for (let n = count(M.fences); n > 0; n--) {
    const along = rng.next() < 0.5;
    let x = rng.range(150, W - 600);
    let y = rng.range(150, H - 600);
    for (let k = rng.int(4, 9); k > 0; k--) {
      if (rng.next() > 0.12) addProp({ kind: 'rect', x, y, w: along ? 46 : 8, h: along ? 8 : 46, type: 'fence' });
      if (along) x += 50;
      else y += 50;
    }
  }
  // Sandbag barricades: medium mechs can't crush them, so they keep clear of other solids like
  // the gap rule (checked against solids only), and stay out of the base clearings.
  for (let n = count(M.sandbags); n > 0; n--) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const along = rng.next() < 0.5;
      const o: Obstacle = { kind: 'rect', x: rng.range(gap, W - gap), y: rng.range(gap, H - gap), w: along ? 56 : 18, h: along ? 18 : 56, type: 'sandbags' };
      if (keepClear(o)) {
        obstacles.push(o);
        break;
      }
    }
  }
  for (let n = count(M.sheds); n > 0; n--) {
    addProp({ kind: 'rect', x: rng.range(100, W - 160), y: rng.range(100, H - 160), w: rng.range(40, 62), h: rng.range(34, 52), type: 'shed' });
  }

  // Bases: target in the middle, turrets around it, a little cover.
  const targets: Placement[] = [];
  const turrets: Placement[] = [];
  const tanks: Placement[] = [];
  const turretCount = Math.max(1, Math.round(T.turretsPerTarget * difficulty.enemyCount));
  const turretTypes = forces.turretTypes ?? T.turretTypes;
  for (const s of sites) {
    if (opts.mission === 'destroy') targets.push({ type: T.target, x: s.x, y: s.y, angle: 0 });
    const a0 = rng.range(0, Math.PI * 2);
    for (let i = 0; i < turretCount; i++) {
      const a = a0 + (i / turretCount) * Math.PI * 2;
      turrets.push({
        type: turretTypes[i % turretTypes.length],
        x: s.x + Math.cos(a) * 150,
        y: s.y + Math.sin(a) * 150,
        angle: angleTo(s, spawn),
      });
    }
  }

  // Tanks: guards near each base, plus roamers between the drop point and the bases.
  const free = (p: Vec, r: number) =>
    p.x > r + 20 &&
    p.y > r + 20 &&
    p.x < W - r - 20 &&
    p.y < H - r - 20 &&
    obstacles.every((o) => boxCircleDistance(box(o), p) > r + 20) &&
    [...turrets, ...targets, ...tanks, ...units].every((u) => dist(u, p) > 120) &&
    stations.every((s) => dist(s, p) > 300);
  const units: Placement[] = [];
  const placeUnit = (list: Placement[], type: () => string, near: Vec, spread: number, home: Vec, r = 40, minFromSpawn = 900) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const p = { x: near.x + rng.range(-spread, spread), y: near.y + rng.range(-spread, spread) };
      if (dist(p, spawn) < minFromSpawn || !free(p, r)) continue;
      list.push({ type: type(), x: p.x, y: p.y, angle: rng.range(-Math.PI, Math.PI), home });
      return true;
    }
    return false;
  };
  const tankTypes = forces.tankTypes ?? T.tankTypes;
  const placeTank = (near: Vec, spread: number, home: Vec) => placeUnit(tanks, () => pickWeighted(rng, tankTypes), near, spread, home);
  const guards = Math.round(T.tanksPerTarget * difficulty.enemyCount);
  for (const s of sites) for (let i = 0; i < guards; i++) placeTank(s, 380, s);
  // Defend missions have no standing army: everything comes in waves.
  const roamers = opts.mission === 'defend' ? 0 : Math.round(rng.int(T.roamingTanks[0], T.roamingTanks[1]) * difficulty.enemyCount * area);
  for (let i = 0; i < roamers; i++) {
    const p = { x: rng.range(400, W - 400), y: rng.range(400, H - 900) };
    placeTank(p, 200, p);
  }

  // Enemy mechs guard a base each (they patrol around it); drone flights roam between.
  // Defend missions bring both in with the attack waves instead.
  const standing = opts.mission !== 'defend' && sites.length > 0;
  for (let i = 0; standing && i < forces.mechs.length; i++) {
    const s = sites[i % sites.length];
    const type = forces.mechs[i];
    placeUnit(units, () => type, s, 450, s, 55, 1100);
  }
  for (let f = 0; standing && f < forces.droneFlights; f++) {
    const flightSize = rng.int(T.droneFlightSize[0], T.droneFlightSize[1]);
    const c = { x: rng.range(400, W - 400), y: rng.range(300, H - 1000) };
    for (let i = 0; i < flightSize; i++) placeUnit(units, () => T.droneType, c, 160, c, 20, 1000);
  }

  // Mech hunt: the ace starts at the outpost farthest from the drop point.
  if (opts.mission === 'hunt' && forces.ace) {
    const far = [...sites].sort((a, b) => dist(b, spawn) - dist(a, spawn))[0] ?? { x: W / 2, y: H * 0.3 };
    const before = units.length;
    placeUnit(units, () => forces.ace!, far, 300, far, 55, 1100);
    if (units.length > before) units[units.length - 1].role = 'ace';
  }
  // Convoy raid: escorts wait with the trucks at the road's start.
  if (convoy) {
    for (let i = 0; i < (forces.escorts ?? 0); i++) {
      const before = units.length;
      placeUnit(units, () => pickWeighted(rng, tankTypes), convoy.start, 220, convoy.start, 40, 900);
      if (units.length > before) units[units.length - 1].role = 'escort';
    }
  }

  return { seed, width: W, height: H, obstacles, spawn, targets, turrets, tanks, units, stations, mission: opts.mission, sites, convoy, defense };
}

function pickWeighted(rng: Rng, items: readonly { type: string; weight: number }[]): string {
  let r = rng.next() * items.reduce((t, i) => t + i.weight, 0);
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.type;
  }
  return items[0].type;
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleTo(a: Vec, b: Vec): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function box(o: Obstacle): Box {
  return o.kind === 'rect' ? [o.x, o.y, o.x + o.w, o.y + o.h] : [o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r];
}

/** Distance from a point to a box (0 inside). */
function boxCircleDistance(b: Box, p: Vec): number {
  const dx = Math.max(b[0] - p.x, 0, p.x - b[2]);
  const dy = Math.max(b[1] - p.y, 0, p.y - b[3]);
  return Math.hypot(dx, dy);
}

/** Free space between two obstacles (negative if they overlap). */
function separation(a: Obstacle, b: Obstacle): number {
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  if (a.kind === 'circle') return boxCircleDistance(box(b), a) - a.r;
  if (b.kind === 'circle') return boxCircleDistance(box(a), b) - b.r;
  const A = box(a);
  const B = box(b);
  const dx = Math.max(B[0] - A[2], A[0] - B[2], 0);
  const dy = Math.max(B[1] - A[3], A[1] - B[3], 0);
  if (dx === 0 && dy === 0) return -1;
  return Math.hypot(dx, dy);
}
