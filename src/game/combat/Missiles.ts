import Phaser from 'phaser';
import type { CollisionWorld } from '../../core/collision';
import { segmentCircle } from '../../core/collision';
import { DEG, approachAngle, type Vec } from '../../core/math';
import type { WeaponDef } from '../../data/weapons';
import { ART_SCALE } from '../art';
import type { Effects } from './Effects';
import type { Team, Unit } from './types';

export interface Missile {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  speed: number;
  /** rad/s; 0 = unguided rocket. */
  turnRate: number;
  target: Unit | null;
  /** Chasing a flare instead of the target. */
  decoy: Vec | null;
  travelled: number;
  range: number;
  damage: number;
  splashRadius: number;
  splashDamage: number;
  team: Team;
  hp: number;
  trailTimer: number;
  img: Phaser.GameObjects.Image;
}

const POOL = 48;
/** Missile hit radius (for being shot down). */
export const MISSILE_RADIUS = 8;
/** Chance each missile chasing you is fooled by a flare. */
const FLARE_CHANCE = 0.85;

/**
 * Missiles and rockets for both sides. Pooled. They are real objects: shots,
 * beams and point defense can destroy them.
 */
export class Missiles {
  readonly list: Missile[] = [];
  /** Damage dealt when a missile reaches something (set by Combat). */
  onHit?: (m: Missile, unit: Unit | null, x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    private world: CollisionWorld,
    private units: Unit[],
    private fx: Effects,
  ) {
    for (let i = 0; i < POOL; i++) {
      const img = scene.add.image(0, 0, 'missile').setVisible(false).setDepth(7).setScale(1 / ART_SCALE);
      this.list.push({
        active: false,
        x: 0,
        y: 0,
        angle: 0,
        speed: 0,
        turnRate: 0,
        target: null,
        decoy: null,
        travelled: 0,
        range: 0,
        damage: 0,
        splashRadius: 0,
        splashDamage: 0,
        team: 'player',
        hp: 1,
        trailTimer: 0,
        img,
      });
    }
  }

  /** Fire a salvo fanned around `angle`. Seeking missiles home on `target` if given. */
  launch(x: number, y: number, angle: number, w: WeaponDef, team: Team, damageMult: number, spreadMult: number, target: Unit | null): void {
    const spec = w.missile!;
    for (let i = 0; i < spec.salvo; i++) {
      const m = this.list.find((x) => !x.active);
      if (!m) return;
      const fan = (i - (spec.salvo - 1) / 2) * spec.fan * DEG;
      const a = angle + fan + (Math.random() * 2 - 1) * w.spread * spreadMult * DEG;
      m.active = true;
      m.x = x;
      m.y = y;
      m.angle = a;
      m.speed = w.projectileSpeed * (0.92 + Math.random() * 0.16);
      m.turnRate = spec.turnRate * DEG;
      m.target = spec.turnRate > 0 ? target : null;
      m.decoy = null;
      m.travelled = 0;
      m.range = w.range * 1.25;
      m.damage = w.damage * damageMult;
      m.splashRadius = w.splash?.radius ?? 0;
      m.splashDamage = (w.splash?.damage ?? 0) * damageMult;
      m.team = team;
      m.hp = spec.hp;
      m.trailTimer = Math.random() * 0.05;
      const tex = w.look === 'rocket' ? 'rocket' : team === 'enemy' ? 'missile-enemy' : 'missile';
      m.img.setTexture(tex).setPosition(x, y).setRotation(a).setVisible(true);
    }
    this.fx.muzzle(x, y, angle, 0.7);
  }

  update(dt: number): void {
    for (const m of this.list) {
      if (!m.active) continue;
      // Steer toward the flare or the target.
      const goal = m.decoy ?? (m.target && m.target.alive ? m.target : null);
      if (goal && m.turnRate > 0) {
        const want = Math.atan2(goal.y - m.y, goal.x - m.x);
        m.angle = approachAngle(m.angle, want, m.turnRate * dt);
      }
      const nx = m.x + Math.cos(m.angle) * m.speed * dt;
      const ny = m.y + Math.sin(m.angle) * m.speed * dt;

      let t = this.world.raycast(m.x, m.y, nx, ny);
      const wall = this.world.lastHit;
      let hitUnit: Unit | null = null;
      for (const u of this.units) {
        if (!u.alive || u.team === m.team) continue;
        const ut = segmentCircle(m.x, m.y, nx, ny, u.x, u.y, u.radius);
        if (ut >= 0 && (t < 0 || ut < t)) {
          t = ut;
          hitUnit = u;
        }
      }
      if (t >= 0) {
        const hx = m.x + (nx - m.x) * t;
        const hy = m.y + (ny - m.y) * t;
        if (!hitUnit && wall >= 0) this.world.damage(wall, m.damage);
        this.detonate(m, hitUnit, hx, hy);
        continue;
      }
      m.travelled += m.speed * dt;
      m.x = nx;
      m.y = ny;
      if (m.decoy && Math.hypot(m.decoy.x - nx, m.decoy.y - ny) < 24) {
        this.detonate(m, null, nx, ny);
        continue;
      }
      if (m.travelled >= m.range) {
        this.detonate(m, null, nx, ny);
        continue;
      }
      m.img.setPosition(nx, ny).setRotation(m.angle);
      m.trailTimer -= dt;
      if (m.trailTimer <= 0) {
        m.trailTimer = 0.04;
        this.fx.trail(nx - Math.cos(m.angle) * 8, ny - Math.sin(m.angle) * 8);
      }
    }
  }

  /** A shot or point defense hit a missile. */
  damage(m: Missile, amount: number): void {
    if (!m.active) return;
    m.hp -= amount;
    if (m.hp <= 0) {
      this.fx.explosion(m.x, m.y, 0.2);
      this.kill(m);
    }
  }

  /** Flares: most missiles chasing `unit` switch to a flare dropped near (x, y). */
  breakLocks(unit: Unit, x: number, y: number): number {
    let fooled = 0;
    for (const m of this.list) {
      if (!m.active || m.target !== unit || m.decoy) continue;
      if (Math.random() > FLARE_CHANCE) continue;
      const a = Math.random() * Math.PI * 2;
      m.decoy = { x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70 };
      m.target = null;
      fooled++;
    }
    return fooled;
  }

  /** Missiles of `team` currently homing on `unit` (for the HUD warning). */
  incoming(unit: Unit): number {
    let n = 0;
    for (const m of this.list) if (m.active && m.target === unit) n++;
    return n;
  }

  /** Nearest hostile missile within `range` of (x, y), for point defense. */
  nearestHostile(x: number, y: number, range: number, team: Team): Missile | null {
    let best: Missile | null = null;
    let bestD = range * range;
    for (const m of this.list) {
      if (!m.active || m.team === team) continue;
      const d = (m.x - x) ** 2 + (m.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  clear(): void {
    for (const m of this.list) this.kill(m);
  }

  private detonate(m: Missile, unit: Unit | null, x: number, y: number): void {
    this.fx.explosion(x, y, 0.3);
    this.onHit?.(m, unit, x, y);
    this.kill(m);
  }

  private kill(m: Missile): void {
    m.active = false;
    m.target = null;
    m.decoy = null;
    m.img.setVisible(false);
  }
}
