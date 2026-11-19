import Phaser from 'phaser';
import type { CollisionWorld } from '../../core/collision';
import { segmentCircle } from '../../core/collision';
import { DEG } from '../../core/math';
import { play, type SoundId } from '../../core/audio';
import type { WeaponDef } from '../../data/weapons';
import { ART_SCALE } from '../art';
import type { Effects } from './Effects';
import type { Team, Unit } from './types';

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

  constructor(
    scene: Phaser.Scene,
    private world: CollisionWorld,
    private units: Unit[],
    private fx: Effects,
  ) {
    for (let i = 0; i < SHOT_POOL; i++) {
      const img = scene.add.image(0, 0, 'bullet').setVisible(false).setDepth(7).setScale(1 / ART_SCALE);
      this.shots.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, travelled: 0, range: 0, damage: 0, team: 'player', big: false, img });
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

  /** Fire one shot of a weapon from (x, y) toward `angle`. */
  fire(x: number, y: number, angle: number, w: WeaponDef, team: Team, damageMult = 1, spreadMult = 1): void {
    const a = angle + (Math.random() * 2 - 1) * w.spread * spreadMult * DEG;
    const damage = w.damage * damageMult;
    const volume = this.volumeAt(x, y) * (team === 'player' ? 1 : 0.7);
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
      let hitUnit: Unit | null = null;
      for (const u of this.units) {
        if (!u.alive || u.team === s.team) continue;
        const ut = segmentCircle(s.x, s.y, nx, ny, u.x, u.y, u.radius);
        if (ut >= 0 && (t < 0 || ut < t)) {
          t = ut;
          hitUnit = u;
        }
      }
      if (t >= 0) {
        const hx = s.x + (nx - s.x) * t;
        const hy = s.y + (ny - s.y) * t;
        const angle = Math.atan2(s.vy, s.vx);
        this.fx.impact(hx, hy, angle, s.big ? 6 : 2);
        if (hitUnit) this.damage(hitUnit, s.damage, s.x, s.y, s.team);
        if (s.big) play('hit', this.volumeAt(hx, hy) * 0.8);
        this.kill(s);
        continue;
      }
      s.travelled += Math.hypot(nx - s.x, ny - s.y);
      s.x = nx;
      s.y = ny;
      if (s.travelled >= s.range) {
        this.kill(s);
        continue;
      }
      s.img.setPosition(nx, ny);
    }
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) b.img.setVisible(false);
      else b.img.setAlpha(b.life / BEAM_LIFE);
    }
  }

  /** Remove every live shot and beam (mission restart). */
  clear(): void {
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
    let hitUnit: Unit | null = null;
    for (const u of this.units) {
      if (!u.alive || u.team === team) continue;
      const ut = segmentCircle(x, y, ex, ey, u.x, u.y, u.radius);
      if (ut >= 0 && (t < 0 || ut < t)) {
        t = ut;
        hitUnit = u;
      }
    }
    const len = (t >= 0 ? t : 1) * range;
    const hx = x + Math.cos(a) * len;
    const hy = y + Math.sin(a) * len;
    if (hitUnit) this.damage(hitUnit, damage, x, y, team);
    if (t >= 0) this.fx.impact(hx, hy, a, 5);
    const b = this.beams[this.nextBeam];
    this.nextBeam = (this.nextBeam + 1) % this.beams.length;
    b.life = BEAM_LIFE;
    b.img
      .setPosition(x, y)
      .setRotation(a)
      .setScale(len / (BEAM_TEX_LENGTH * ART_SCALE), 1 / ART_SCALE)
      .setAlpha(1)
      .setVisible(true);
    this.fx.muzzle(x, y, a, 0.5);
  }

  private damage(u: Unit, amount: number, fromX: number, fromY: number, team: Team): void {
    u.takeDamage(amount, fromX, fromY);
    this.onUnitHit?.(u, team, amount);
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
