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
  img: Phaser.GameObjects.Image;
}

interface Beam {
  img: Phaser.GameObjects.Image;
  life: number;
}

const SHOT_POOL = 240;
const BEAM_POOL = 8;
const BEAM_LIFE = 0.12;
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
  /** Where the listener is, for distance-based volume. */
  listenerX = 0;
  listenerY = 0;
  /** Called when a shot or beam hits a unit (stats, alerts). */
  onUnitHit?: (unit: Unit, team: Team, damage: number) => void;

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
        img,
      });
    }
    for (let i = 0; i < BEAM_POOL; i++) {
      const img = scene.add
        .image(0, 0, 'beam')
        .setOrigin(0, 0.5)
        .setVisible(false)
        .setDepth(8)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.beams.push({ img, life: 0 });
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
      this.fireBeam(x, y, a, w.range, damage, team);
      play('laser', volume);
      return;
    }
    const shot = this.shots.find((s) => !s.active);
    if (!shot) return;
    const big = w.look === 'shell';
    shot.active = true;
    shot.x = x;
    shot.y = y;
    shot.vx = Math.cos(a) * w.projectileSpeed;
    shot.vy = Math.sin(a) * w.projectileSpeed;
    shot.travelled = 0;
    shot.range = w.range;
    shot.splashRadius = w.splash?.radius ?? 0;
    shot.splashDamage = (w.splash?.damage ?? 0) * damageMult;
    // Splash shells burst a little short of or past the aim point.
    if (shot.splashRadius > 0 && aimDistance > 0) shot.range = Math.min(w.range, aimDistance * (0.92 + Math.random() * 0.16));
    shot.damage = damage;
    shot.team = team;
    shot.big = big;
    const tex = (big ? 'shell' : 'bullet') + (team === 'enemy' ? '-enemy' : '');
    shot.img.setTexture(tex).setPosition(x, y).setRotation(a).setVisible(true);
    this.fx.muzzle(x, y, a, big ? 0.8 : 0.45);
    play((big ? 'cannon' : 'mg') as SoundId, volume);
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
        if (!hitUnit && s.splashRadius > 0) this.burst(hx, hy, s.splashRadius, s.splashDamage, s.team, null);
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
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) b.img.setVisible(false);
      else b.img.setAlpha(b.life / BEAM_LIFE);
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
  }

  private fireBeam(x: number, y: number, a: number, range: number, damage: number, team: Team): void {
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
      this.showBeam(x, y, a, len, 'beam');
      return;
    }
    const len = (t >= 0 ? t : 1) * range;
    const hx = x + Math.cos(a) * len;
    const hy = y + Math.sin(a) * len;
    if (hitUnit) this.damage(hitUnit, damage, x, y, team, hx, hy);
    else if (wall >= 0) this.world.damage(wall, damage);
    if (t >= 0) this.fx.impact(hx, hy, a, 5);
    this.showBeam(x, y, a, len, 'beam');
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

  private showBeam(x: number, y: number, a: number, len: number, texture: string): void {
    const b = this.beams[this.nextBeam];
    this.nextBeam = (this.nextBeam + 1) % this.beams.length;
    b.life = BEAM_LIFE;
    b.img
      .setTexture(texture)
      .setPosition(x, y)
      .setRotation(a)
      .setScale(len / (BEAM_TEX_LENGTH * ART_SCALE), 1 / ART_SCALE)
      .setAlpha(1)
      .setVisible(true);
  }

  private damage(u: Unit, amount: number, fromX: number, fromY: number, team: Team, hitX: number, hitY: number): void {
    u.takeDamage(amount, fromX, fromY, hitX, hitY);
    this.onUnitHit?.(u, team, amount);
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
      this.onUnitHit?.(u, team, amount);
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
