import Phaser from 'phaser';
import type { CollisionWorld } from '../../core/collision';
import { segmentCircle } from '../../core/collision';
import { DEG } from '../../core/math';
import { play, type SoundId } from '../../core/audio';
import type { WeaponDef } from '../../data/weapons';
import { ART_SCALE } from '../art';
import type { Effects } from './Effects';
import type { Team, Unit } from './types';
import { MISSILE_RADIUS, Missiles, type Missile } from './Missiles';

interface Shot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  travelled: number;
  range: number;
  damage: number;
  team: Team;
  big: boolean;
  splashRadius: number;
  splashDamage: number;
  splashOnHit: boolean;
  img: Phaser.GameObjects.Image;
}

interface Beam {
  img: Phaser.GameObjects.Image;
  life: number;
  max: number;
}

/** A continuous beam's sprite, shown for the frames it is fired in. */
interface Stream {
  img: Phaser.GameObjects.Image;
  frame: number;
}

const SHOT_POOL = 240;
const BEAM_POOL = 24;
const STREAM_POOL = 12;
const BEAM_LIFE = 0.12;
const ARC_LIFE = 0.2;
const BEAM_TEX_LENGTH = 64;

/**
 * Projectiles and beams for both sides. Everything is pooled: firing never
 * creates objects. If the pool is exhausted the shot is dropped, which only
 * happens in extreme situations.
 */
export class Combat {
  private shots: Shot[] = [];
  private beams: Beam[] = [];
  private nextBeam = 0;
  private streams: Stream[] = [];
  /** Counts combat updates; streams fired since the last update carry the current number. */
  private frame = 0;
  /** Scratch list for lightning targets (no per-shot allocation). */
  private arcHits: Unit[] = [];
  /** Where the listener is, for distance-based volume. */
  listenerX = 0;
  listenerY = 0;
  /**
   * Called when a shot or beam hits a unit (stats, alerts). `counts` is false for
   * damage that shouldn't count as a separate hit (most frames of a continuous beam,
   * lightning chains, splash).
   */
  onUnitHit?: (unit: Unit, team: Team, damage: number, counts: boolean) => void;

  readonly missiles: Missiles;

  constructor(
    scene: Phaser.Scene,
    private world: CollisionWorld,
    private units: Unit[],
    private fx: Effects,
  ) {
    this.missiles = new Missiles(scene, world, units, fx);
    this.missiles.onHit = (m, unit, x, y) => {
      if (unit) this.damage(unit, m.damage, x - Math.cos(m.angle) * 30, y - Math.sin(m.angle) * 30, m.team, x, y);
      if (m.splashRadius > 0) this.burst(x, y, m.splashRadius, m.splashDamage, m.team, unit, false);
      play('hit', this.volumeAt(x, y));
    };
    for (let i = 0; i < SHOT_POOL; i++) {
      const img = scene.add.image(0, 0, 'bullet').setVisible(false).setDepth(7).setScale(1 / ART_SCALE);
      this.shots.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        travelled: 0,
        range: 0,
        damage: 0,
        team: 'player',
        big: false,
        splashRadius: 0,
        splashDamage: 0,
        splashOnHit: false,
        img,
      });
    }
    for (let i = 0; i < STREAM_POOL; i++) {
      const img = scene.add.image(0, 0, 'beam').setOrigin(0, 0.5).setVisible(false).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
      this.streams.push({ img, frame: -1 });
    }
    for (let i = 0; i < BEAM_POOL; i++) {
      const img = scene.add
        .image(0, 0, 'beam')
        .setOrigin(0, 0.5)
        .setVisible(false)
        .setDepth(8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.beams.push({ img, life: 0, max: BEAM_LIFE });
    }
  }

  /**
   * Fire one shot of a weapon from (x, y) toward `angle`. `aimDistance` is how far
   * away the target is: shells with splash burst there if they don't hit anything first.
   */
  fire(
    x: number,
    y: number,
    angle: number,
    w: WeaponDef,
    team: Team,
    damageMult = 1,
    spreadMult = 1,
    aimDistance = 0,
    target: Unit | null = null,
  ): void {
    const a = angle + (Math.random() * 2 - 1) * w.spread * spreadMult * DEG;
    const damage = w.damage * damageMult;
    const volume = this.volumeAt(x, y) * (team === 'player' ? 1 : 0.7);
    if (w.delivery === 'missile') {
      this.missiles.launch(x, y, angle, w, team, damageMult, spreadMult, target);
      play('missile', volume);
      return;
    }
    if (w.delivery === 'beam') {
      const tex = (w.look === 'pulse' ? 'beam-pulse' : w.look === 'largeLaser' ? 'beam-large' : 'beam') + (team === 'enemy' ? '-enemy' : '');
      this.fireBeam(x, y, a, w.range, damage, team, tex);
      play(w.look === 'pulse' ? 'pulse' : 'laser', volume * (w.look === 'largeLaser' ? 1.3 : 1));
      return;
    }
    if (w.delivery === 'arc') {
      this.fireArc(x, y, angle, w, team, damageMult);
      play('zap', volume);
      return;
    }
    if (w.delivery === 'stream') return; // streams fire through stream(), every frame
    const shot = this.shots.find((s) => !s.active);
    if (!shot) return;
    const big = w.look !== 'bullet';
    shot.active = true;
    shot.x = x;
    shot.y = y;
    shot.vx = Math.cos(a) * w.projectileSpeed;
    shot.vy = Math.sin(a) * w.projectileSpeed;
    shot.travelled = 0;
    shot.range = w.range;
    shot.splashRadius = w.splash?.radius ?? 0;
    shot.splashDamage = (w.splash?.damage ?? 0) * damageMult;
    shot.splashOnHit = !!w.splashOnHit;
    // Splash shells burst a little short of or past the aim point.
    if (shot.splashRadius > 0 && aimDistance > 0) shot.range = Math.min(w.range, aimDistance * (0.92 + Math.random() * 0.16));
    shot.damage = damage;
    shot.team = team;
    shot.big = big;
    const base = w.look === 'heavyShell' ? 'heavy-shell' : w.look === 'plasma' ? 'plasma' : big ? 'shell' : 'bullet';
    shot.img.setTexture(base + (team === 'enemy' ? '-enemy' : '')).setPosition(x, y).setRotation(a).setVisible(true);
    this.fx.muzzle(x, y, a, w.look === 'heavyShell' ? 1.2 : big ? 0.8 : 0.45);
    const sound: SoundId = w.look === 'heavyShell' ? 'heavy' : w.look === 'plasma' ? 'plasma' : big ? 'cannon' : 'mg';
    play(sound, volume);
  }

  /**
   * One frame of a continuous beam: damage and terrain burn scale with `dt`.
   * `tick` marks the frames that count as a hit for stats (the weapon sends one
   * every half second it is held).
   */
  stream(x: number, y: number, a: number, w: WeaponDef, team: Team, dt: number, damageMult = 1, tick = false): void {
    const ex = x + Math.cos(a) * w.range;
    const ey = y + Math.sin(a) * w.range;
    let t = this.world.raycast(x, y, ex, ey);
    const wall = this.world.lastHit;
    let hitUnit: Unit | null = null;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const ut = segmentCircle(x, y, ex, ey, u.x, u.y, u.radius);
      if (ut >= 0 && (t < 0 || ut < t)) {
        t = ut;
        hitUnit = u;
      }
    }
    const damage = w.damage * damageMult * dt;
    const m = this.missileOnLine(x, y, ex, ey, team, t);
    let len: number;
    if (m) {
      len = Math.hypot(m.x - x, m.y - y);
      this.missiles.damage(m, 6 * dt);
    } else {
      len = (t >= 0 ? t : 1) * w.range;
      const hx = x + Math.cos(a) * len;
      const hy = y + Math.sin(a) * len;
      if (hitUnit) this.damage(hitUnit, damage, x, y, team, hx, hy, tick);
      else if (wall >= 0) this.world.damage(wall, damage);
      if (t >= 0 && Math.random() < dt * 20) this.fx.impact(hx, hy, a, 1);
    }
    const s = this.streams.find((st) => st.frame !== this.frame);
    if (s) {
      s.frame = this.frame;
      s.img
        .setTexture((w.look === 'largeLaser' ? 'beam-large' : 'beam') + (team === 'enemy' ? '-enemy' : ''))
        .setPosition(x, y)
        .setRotation(a)
        .setScale(len / (BEAM_TEX_LENGTH * ART_SCALE), (0.8 + Math.random() * 0.25) / ART_SCALE)
        .setAlpha(0.8 + Math.random() * 0.2)
        .setVisible(true);
    }
    play('beam', this.volumeAt(x, y) * (team === 'player' ? 1 : 0.7));
  }

  /**
   * Lightning: strikes the nearest enemy within the cone in front (needs a clear
   * line), then jumps to the nearest unhit enemies within chain range, weaker each time.
   * With nothing to hit, it crackles out a short way.
   */
  private fireArc(x: number, y: number, angle: number, w: WeaponDef, team: Team, damageMult: number): void {
    const arc = w.arc!;
    const hits = this.arcHits;
    hits.length = 0;
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const d = Math.hypot(u.x - x, u.y - y) - u.radius;
      if (d > w.range || d >= bestD) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(u.y - y, u.x - x) - angle), Math.cos(Math.atan2(u.y - y, u.x - x) - angle)));
      if (off > arc.coneDeg * DEG) continue;
      if (this.world.raycast(x, y, u.x, u.y) >= 0) continue;
      best = u;
      bestD = d;
    }
    this.fx.muzzle(x, y, angle, 0.6);
    if (!best) {
      const len = w.range * (0.35 + Math.random() * 0.2);
      const a = angle + (Math.random() - 0.5) * 0.5;
      const t = this.world.raycast(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
      this.showBeam(x, y, a, (t >= 0 ? t : 1) * len, `arc-${Math.floor(Math.random() * 3)}`, ARC_LIFE);
      return;
    }
    let fromX = x;
    let fromY = y;
    let damage = w.damage * damageMult;
    let target: Unit | null = best;
    for (let i = 0; i <= arc.chains && target; i++) {
      hits.push(target);
      const a = Math.atan2(target.y - fromY, target.x - fromX);
      const len = Math.max(0, Math.hypot(target.x - fromX, target.y - fromY) - target.radius * 0.5);
      const hx = fromX + Math.cos(a) * len;
      const hy = fromY + Math.sin(a) * len;
      this.showBeam(fromX, fromY, a, len, `arc-${Math.floor(Math.random() * 3)}`, ARC_LIFE);
      this.damage(target, damage, fromX, fromY, team, hx, hy, i === 0);
      this.fx.impact(hx, hy, a, 3);
      // Next: the nearest enemy to this one that hasn't been hit yet.
      fromX = target.x;
      fromY = target.y;
      damage *= arc.chainFalloff;
      let next: Unit | null = null;
      let nextD = arc.chainRange;
      for (const u of this.units) {
        if (!u.alive || u.team === team || hits.includes(u)) continue;
        const d = Math.hypot(u.x - fromX, u.y - fromY) - u.radius;
        if (d < nextD && this.world.raycast(fromX, fromY, u.x, u.y) < 0) {
          next = u;
          nextD = d;
        }
      }
      target = next;
    }
  }

  update(dt: number): void {
    for (const s of this.shots) {
      if (!s.active) continue;
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      let t = this.world.raycast(s.x, s.y, nx, ny);
      const wall = this.world.lastHit;
      let hitUnit: Unit | null = null;
      for (const u of this.units) {
        if (!u.alive || u.team === s.team) continue;
        const ut = segmentCircle(s.x, s.y, nx, ny, u.x, u.y, u.radius);
        if (ut >= 0 && (t < 0 || ut < t)) {
          t = ut;
          hitUnit = u;
        }
      }
      const hitMissile = this.missileOnLine(s.x, s.y, nx, ny, s.team, t);
      if (hitMissile) {
        this.fx.impact(hitMissile.x, hitMissile.y, 0, 3);
        this.missiles.damage(hitMissile, 1);
        this.kill(s);
        continue;
      }
      if (t >= 0) {
        const hx = s.x + (nx - s.x) * t;
        const hy = s.y + (ny - s.y) * t;
        const angle = Math.atan2(s.vy, s.vx);
        this.fx.impact(hx, hy, angle, s.big ? 6 : 2);
        if (hitUnit) this.damage(hitUnit, s.damage, s.x, s.y, s.team, hx, hy);
        else if (wall >= 0) this.world.damage(wall, s.damage);
        if (s.splashRadius > 0 && (!hitUnit || s.splashOnHit)) this.burst(hx, hy, s.splashRadius, s.splashDamage, s.team, hitUnit);
        if (s.big) play('hit', this.volumeAt(hx, hy) * 0.8);
        this.kill(s);
        continue;
      }
      s.travelled += Math.hypot(nx - s.x, ny - s.y);
      s.x = nx;
      s.y = ny;
      if (s.travelled >= s.range) {
        if (s.splashRadius > 0) this.burst(nx, ny, s.splashRadius, s.splashDamage, s.team, null);
        this.kill(s);
        continue;
      }
      s.img.setPosition(nx, ny);
    }
    this.missiles.update(dt);
    for (const st of this.streams) if (st.frame !== this.frame && st.img.visible) st.img.setVisible(false);
    this.frame++;
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) b.img.setVisible(false);
      else b.img.setAlpha(b.life / b.max);
    }
  }

  /** Remove every live shot and beam (mission restart). */
  clear(): void {
    this.missiles.clear();
    for (const s of this.shots) this.kill(s);
    for (const b of this.beams) {
      b.life = 0;
      b.img.setVisible(false);
    }
    for (const st of this.streams) {
      st.frame = -1;
      st.img.setVisible(false);
    }
  }

  private fireBeam(x: number, y: number, a: number, range: number, damage: number, team: Team, texture: string): void {
    const ex = x + Math.cos(a) * range;
    const ey = y + Math.sin(a) * range;
    let t = this.world.raycast(x, y, ex, ey);
    const wall = this.world.lastHit;
    let hitUnit: Unit | null = null;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const ut = segmentCircle(x, y, ex, ey, u.x, u.y, u.radius);
      if (ut >= 0 && (t < 0 || ut < t)) {
        t = ut;
        hitUnit = u;
      }
    }
    const m = this.missileOnLine(x, y, ex, ey, team, t);
    if (m) {
      // The beam stops at the first missile in its way and burns it.
      const len = Math.hypot(m.x - x, m.y - y);
      this.missiles.damage(m, 2);
      this.showBeam(x, y, a, len, texture);
      return;
    }
    const len = (t >= 0 ? t : 1) * range;
    const hx = x + Math.cos(a) * len;
    const hy = y + Math.sin(a) * len;
    if (hitUnit) this.damage(hitUnit, damage, x, y, team, hx, hy);
    else if (wall >= 0) this.world.damage(wall, damage);
    if (t >= 0) this.fx.impact(hx, hy, a, 5);
    this.showBeam(x, y, a, len, texture);
    this.fx.muzzle(x, y, a, 0.5);
  }

  flareEffect(x: number, y: number): void {
    this.fx.flareBurst(x, y);
  }

  /** Point defense: a quick tracer at a missile that may destroy it. */
  pointDefenseShot(x: number, y: number, m: Missile, damage: number, accuracy: number): void {
    const a = Math.atan2(m.y - y, m.x - x);
    this.showBeam(x, y, a, Math.hypot(m.x - x, m.y - y), 'pd-tracer');
    if (Math.random() < accuracy) {
      this.fx.impact(m.x, m.y, a, 2);
      this.missiles.damage(m, damage);
    }
    play('mg', this.volumeAt(x, y) * 0.5);
  }

  /** First hostile missile crossing the segment, if it's closer than fraction `t` (or t < 0). */
  private missileOnLine(x0: number, y0: number, x1: number, y1: number, team: Team, t: number): Missile | null {
    let best: Missile | null = null;
    let bestT = t < 0 ? 2 : t;
    for (const m of this.missiles.list) {
      if (!m.active || m.team === team) continue;
      const mt = segmentCircle(x0, y0, x1, y1, m.x, m.y, MISSILE_RADIUS);
      if (mt >= 0 && mt < bestT) {
        bestT = mt;
        best = m;
      }
    }
    return best;
  }

  private showBeam(x: number, y: number, a: number, len: number, texture: string, life = BEAM_LIFE): void {
    const b = this.beams[this.nextBeam];
    this.nextBeam = (this.nextBeam + 1) % this.beams.length;
    b.life = life;
    b.max = life;
    b.img
      .setTexture(texture)
      .setPosition(x, y)
      .setRotation(a)
      .setScale(len / (BEAM_TEX_LENGTH * ART_SCALE), 1 / ART_SCALE)
      .setAlpha(1)
      .setVisible(true);
  }

  private damage(u: Unit, amount: number, fromX: number, fromY: number, team: Team, hitX: number, hitY: number, counts = true): void {
    u.takeDamage(amount, fromX, fromY, hitX, hitY);
    this.onUnitHit?.(u, team, amount, counts);
  }

  /** Ground burst: damage falls off with distance. Mechs take it in the legs. */
  private burst(x: number, y: number, radius: number, damage: number, team: Team, skip: Unit | null, effect = true): void {
    if (effect) {
      this.fx.explosion(x, y, 0.35);
      play('hit', this.volumeAt(x, y));
    }
    for (const u of this.units) {
      if (!u.alive || u.team === team || u === skip) continue;
      const d = Math.hypot(u.x - x, u.y - y) - u.radius;
      if (d >= radius) continue;
      const amount = damage * (1 - Math.max(0, d) / radius);
      if (u.takeSplash) u.takeSplash(amount);
      else u.takeDamage(amount, x, y);
      this.onUnitHit?.(u, team, amount, false);
    }
    // Explosives are good at knocking down buildings.
    for (const i of this.world.obstaclesNear(x, y, radius)) {
      this.world.damage(i, damage * this.world.terrain[i].splashMultiplier);
    }
  }

  private kill(s: Shot): void {
    s.active = false;
    s.img.setVisible(false);
  }

  volumeAt(x: number, y: number): number {
    const d = Math.hypot(x - this.listenerX, y - this.listenerY);
    return Math.max(0, 1 - d / 1100);
  }
}
