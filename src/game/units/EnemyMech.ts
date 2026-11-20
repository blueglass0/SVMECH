import Phaser from 'phaser';
import { DEG, wrapAngle, type Vec } from '../../core/math';
import { play } from '../../core/audio';
import { CHASSIS, type Section } from '../../data/chassis';
import type { EnemyDef, EnemyMechDef } from '../../data/enemies';
import type { MechState } from '../../career/types';
import { DAMAGE_RULES } from '../../data/damage';
import { mechStats } from '../mechStats';
import type { Effects } from '../combat/Effects';
import { Enemy, GIVE_UP_AFTER, PathFollower, type AiContext } from './Enemy';
import { Mech, type MountedWeapon, type PilotInput } from './Mech';
import { SECTIONS } from './SectionDamage';

/** Section bars above the mech: arms either side of the torso, legs underneath. */
const BARS: { section: Section; x: number; w: number; y: number; h: number }[] = [
  { section: 'leftArm', x: -26, w: 12, y: 0, h: 4 },
  { section: 'torso', x: -12, w: 24, y: 0, h: 4 },
  { section: 'rightArm', x: 14, w: 12, y: 0, h: 4 },
  { section: 'legs', x: -26, w: 52, y: 6, h: 3 },
];

/**
 * An enemy mech: the same `Mech` the player drives (movement, locational
 * damage, heat, weapons, equipment), with an AI filling in the pilot input.
 * It closes to its preferred range, circles while firing, aims with its best
 * weapon's line, holds fire when running hot, and uses shields and flares.
 */
export class EnemyMech extends Enemy {
  readonly mech: Mech;
  private m: EnemyMechDef;
  private input: PilotInput;
  private move: Vec = { x: 0, y: 0 };
  private aim: Vec = { x: 0, y: 0 };
  private path = new PathFollower();
  private patrolWait = 0;
  private strafeSign = Math.random() < 0.5 ? 1 : -1;
  private strafeTimer = 0;
  private aimError = 0;
  private aimErrorTarget = 0;
  private aimErrorTimer = 0;
  private engagedFor = 0;
  private stuck = 0;
  /** Damage taken recently (decays), to decide when to raise the shield. */
  private recentDamage = 0;
  private smokeTimer = 0;
  private configured = false;
  private fx?: Effects;
  private bars: { section: Section; x: number; w: number; y: number; h: number; bg: Phaser.GameObjects.Image; fill: Phaser.GameObjects.Image }[];
  private tmp: Vec = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    def: EnemyDef,
    x: number,
    y: number,
    angle: number,
    private home: Vec,
    skin = '',
  ) {
    super(scene, def, x, y);
    this.m = def.mech!;
    const chassis = CHASSIS[this.m.chassis];
    const stats = mechStats(this.m);
    const state: MechState = {
      id: -1,
      chassis: this.m.chassis,
      weapons: this.m.weapons,
      equipment: this.m.equipment,
      sections: { ...stats.sections },
      ammo: { ...stats.ammoCapacity },
      destroyed: false,
    };
    this.mech = new Mech(scene, state, { ...chassis.movement }, x, y, angle, {
      team: 'enemy',
      skin: skin || '-enemy',
      armorScale: this.m.armorScale,
      markers: false,
      sizeScale: this.m.sizeScale ?? 1,
    });
    this.mech.body = this;
    this.mech.onSectionDestroyed = (s) => this.onSectionLost(s);
    this.radius = this.mech.radius;
    this.hp = this.maxHp = this.mech.sections.max.torso;
    this.input = { scheme: 'direction', move: this.move, aimTarget: null, fire1: false, fire2: false, equip1: false, equip2: false, lock: null, aimDistance: 0 };
    this.bars = BARS.map((b) => ({
      ...b,
      bg: scene.add.image(0, 0, 'px-bg').setOrigin(0, 0.5).setDepth(11).setVisible(false),
      fill: scene.add.image(0, 0, 'px-enemy').setOrigin(0, 0.5).setDepth(11).setVisible(false),
    }));
  }

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    if (!this.configured) {
      // Combat difficulty applies on top of the mech's own tuning.
      this.configured = true;
      this.mech.opts.damageMult = ctx.difficulty.enemyDamage * this.m.damageScale;
      this.mech.opts.spreadMult = ctx.difficulty.enemySpread;
    }
    this.fx = ctx.fx;
    this.sense(dt, ctx);
    const p = ctx.player;
    const mech = this.mech;
    const input = this.input;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    const preferred = this.def.preferredRange ?? 380;
    this.engagedFor = this.engaged ? this.engagedFor + dt : 0;
    this.recentDamage *= Math.exp(-dt / 1.5);
    input.fire1 = input.fire2 = input.equip1 = input.equip2 = false;
    input.lock = null;
    this.move.x = this.move.y = 0;

    // --- Where to walk ---
    if (this.engaged) {
      if (this.lostTimer > GIVE_UP_AFTER && Math.hypot(this.lastSeen.x - this.x, this.lastSeen.y - this.y) < 100) {
        this.engaged = false;
        this.path.clear();
      } else if (this.canSee && d <= preferred) {
        this.path.clear();
        this.strafe(dt, Math.atan2(dy, dx), d, preferred);
      } else {
        this.path.setGoal(this.lastSeen.x, this.lastSeen.y);
      }
    }
    if (!this.engaged) this.patrol(dt);
    const wp = this.path.next(this.x, this.y, dt, ctx.nav);
    if (wp) {
      const wx = wp.x - this.x;
      const wy = wp.y - this.y;
      const wd = Math.hypot(wx, wy) || 1;
      // Patrolling is a stroll; chasing is full speed.
      const k = this.engaged ? 1 : 0.55;
      this.move.x = (wx / wd) * k;
      this.move.y = (wy / wd) * k;
    }

    // --- Where to aim ---
    let aimAngle: number;
    let primary: MountedWeapon | null = null;
    if (this.engaged && p.alive) {
      primary = this.primaryWeapon(d);
      const tx = this.canSee ? p.x : this.lastSeen.x;
      const ty = this.canSee ? p.y : this.lastSeen.y;
      // Lead a moving target by the primary weapon's flight time.
      const speed = primary?.def.projectileSpeed ?? 0;
      const lead = this.canSee && speed > 0 ? (d / speed) * (this.def.aimLead ?? 0.5) : 0;
      const lx = tx + p.vx * lead;
      const ly = ty + p.vy * lead;
      const ld = Math.max(1, Math.hypot(lx - this.x, ly - this.y));
      // Weapons fire straight ahead from their hardpoint: turn so the primary's line crosses the target.
      const offset = primary ? Math.asin(Math.max(-1, Math.min(1, (primary.mount.y * this.mech.opts.sizeScale) / ld))) : 0;
      this.aimErrorTimer -= dt;
      if (this.aimErrorTimer <= 0) {
        this.aimErrorTimer = 0.7 + Math.random() * 0.6;
        this.aimErrorTarget = (Math.random() * 2 - 1) * this.m.aimErrorDeg * DEG;
      }
      this.aimError += (this.aimErrorTarget - this.aimError) * Math.min(1, dt * 3);
      aimAngle = Math.atan2(ly - this.y, lx - this.x) - offset + this.aimError;
      this.aim.x = this.x + Math.cos(aimAngle) * ld;
      this.aim.y = this.y + Math.sin(aimAngle) * ld;
      input.aimDistance = ld;
    } else {
      // Not fighting: the torso looks where the legs walk.
      aimAngle = mech.motor.legAngle;
      this.aim.x = this.x + Math.cos(aimAngle) * 200;
      this.aim.y = this.y + Math.sin(aimAngle) * 200;
      input.aimDistance = 0;
    }
    input.aimTarget = this.aim;

    // --- When to fire ---
    if (this.canSee && p.alive && this.engagedFor > this.m.reaction) {
      const off = Math.abs(wrapAngle(aimAngle - mech.motor.torsoAngle));
      // Heat discipline: only fire what the mech can take without shutting down.
      let heat = mech.heat;
      input.fire1 = this.groupReady(1, d, off, heat);
      if (input.fire1) heat += this.volleyHeat(1);
      input.fire2 = this.groupReady(2, d, off, heat);
      if ((input.fire1 || input.fire2) && off < 20 * DEG) input.lock = p;
    }

    // --- Equipment: flares against missiles homing on it, shield when taking a beating ---
    const actions = mech.loadout.actions;
    for (let i = 0; i < actions.length; i++) {
      const press =
        actions[i] === 'flares'
          ? ctx.combat.missiles.incoming(this) > 0 && this.missileClose(ctx)
          : this.engaged && this.recentDamage > 35;
      if (i === 0) input.equip1 = press;
      else input.equip2 = press;
    }

    const ox = this.x;
    const oy = this.y;
    mech.update(dt, input, ctx.world, ctx.bodies, ctx.combat);
    this.x = mech.x;
    this.y = mech.y;

    // Wedged against something: re-plan, and circle the other way.
    const wants = Math.hypot(this.move.x, this.move.y) > 0.3;
    this.stuck = wants && Math.hypot(this.x - ox, this.y - oy) < dt * 15 ? this.stuck + dt : 0;
    if (this.stuck > 1.2) {
      this.stuck = 0;
      this.path.repath = 0;
      this.strafeSign = -this.strafeSign;
    }

    this.emitSmoke(dt, ctx.fx);
    if (this.mech.sections.total < this.mech.sections.totalMax) this.updateBar();
  }

  /** In range: circle the player, backing off if too close and edging in if drifting out. */
  private strafe(dt: number, toward: number, d: number, preferred: number): void {
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = 2 + Math.random() * 3;
      if (Math.random() < 0.5) this.strafeSign = -this.strafeSign;
    }
    let a = toward + (this.strafeSign * Math.PI) / 2;
    if (d < preferred * 0.55) a = toward + Math.PI - this.strafeSign * 0.6;
    else if (d > preferred * 0.9) a = toward + this.strafeSign * 0.7;
    const k = Math.max(0.25, this.m.strafe);
    this.move.x = Math.cos(a) * k;
    this.move.y = Math.sin(a) * k;
  }

  private patrol(dt: number): void {
    if (this.path.hasGoal) return;
    this.patrolWait -= dt;
    if (this.patrolWait > 0) return;
    this.patrolWait = 3 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 300;
    this.path.setGoal(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }

  /** The working weapon doing the most damage that reaches the target (else the most damaging overall). */
  private primaryWeapon(d: number): MountedWeapon | null {
    let best: MountedWeapon | null = null;
    let bestScore = -1;
    for (const w of this.mech.weapons) {
      if (w.destroyed || w.def.delivery === 'missile') continue;
      const dps = w.def.delivery === 'stream' ? w.def.damage : w.def.damage * w.def.fireRate;
      const score = dps + (w.def.range >= d ? 1000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best;
  }

  /** Fire a group if any of its weapons reach, the torso is on target, and the volley won't cook the mech. */
  private groupReady(group: 1 | 2, d: number, off: number, heat: number): boolean {
    let range = 0;
    let stream = false;
    let any = false;
    for (const w of this.mech.weapons) {
      if (w.group !== group || w.destroyed) continue;
      any = true;
      range = Math.max(range, w.def.range);
      if (w.def.delivery === 'stream') stream = true;
    }
    if (!any || d > range * 0.95 + this.radius) return false;
    if (off > (stream ? 12 : 7) * DEG) return false;
    return heat + this.volleyHeat(group) < this.mech.loadout.heatCapacity * 0.9;
  }

  /** Heat the group's ready weapons would add if fired now (streams: about a second's worth). */
  private volleyHeat(group: 1 | 2): number {
    let heat = 0;
    for (const w of this.mech.weapons) {
      if (w.group !== group || w.destroyed) continue;
      if (w.def.delivery === 'stream') heat += w.def.heat;
      else if (w.cooldown < 0.25) heat += w.def.heat; // about to fire (cooldowns tick down before firing)
    }
    return heat;
  }

  private missileClose(ctx: AiContext): boolean {
    for (const mi of ctx.combat.missiles.list) {
      if (mi.active && mi.target === this && Math.hypot(mi.x - this.x, mi.y - this.y) < 260) return true;
    }
    return false;
  }

  takeDamage(amount: number, fromX: number, fromY: number, hitX?: number, hitY?: number): void {
    if (!this.alive) return;
    this.mech.takeDamage(amount, fromX, fromY, hitX, hitY);
    this.recentDamage += amount;
    this.afterHit(fromX, fromY);
  }

  takeSplash(amount: number): void {
    if (!this.alive) return;
    this.mech.takeSplash(amount);
    this.recentDamage += amount;
    this.afterHit(this.lastSeen.x, this.lastSeen.y);
  }

  private afterHit(fromX: number, fromY: number): void {
    this.hp = this.mech.sections.hp.torso;
    this.alert({ x: fromX, y: fromY });
    this.updateBar();
    if (!this.mech.alive) this.alive = false;
  }

  private onSectionLost(s: Section): void {
    if (!this.fx || s === 'torso') return;
    if (s === 'legs') this.fx.explosion(this.x, this.y, 0.5);
    else {
      this.mech.view.armPosition(s, this.tmp);
      this.fx.explosion(this.tmp.x, this.tmp.y, 0.7);
    }
    play('explode', 0.5);
  }

  /** Damaged sections smoke (only while you can see the mech). */
  private emitSmoke(dt: number, fx: Effects): void {
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0 || this.detection !== 'visible') return;
    this.smokeTimer = 0.2;
    const sec = this.mech.sections;
    for (const s of SECTIONS) {
      if (sec.frac(s) >= DAMAGE_RULES.smokeBelow || Math.random() < 0.5) continue;
      if (s === 'leftArm' || s === 'rightArm') this.mech.view.armPosition(s, this.tmp);
      else {
        this.tmp.x = this.x;
        this.tmp.y = this.y;
      }
      fx.puff(this.tmp.x, this.tmp.y, sec.destroyed(s));
    }
  }

  place(x: number, y: number): void {
    super.place(x, y);
    this.mech.motor.pos.x = x;
    this.mech.motor.pos.y = y;
  }

  protected updateBar(): void {
    const show = this.alive && this.detection === 'visible' && this.mech.sections.total < this.mech.sections.totalMax;
    const top = this.y - this.radius - 18;
    for (const b of this.bars) {
      const f = this.mech.sections.frac(b.section);
      b.bg.setVisible(show).setPosition(this.x + b.x - 1, top + b.y).setDisplaySize(b.w + 2, b.h + 2);
      b.fill
        .setVisible(show && f > 0)
        .setPosition(this.x + b.x, top + b.y)
        .setDisplaySize(Math.max(1, b.w * f), b.h);
    }
  }

  protected parts(): Phaser.GameObjects.Image[] {
    return [];
  }

  protected showParts(visible: boolean): void {
    this.mech.view.setVisible(visible);
    this.mech.shown = visible;
  }

  protected onDestroyed(fx: Effects): void {
    for (const b of this.bars) {
      b.bg.setVisible(false);
      b.fill.setVisible(false);
    }
    this.mech.view.setSkin('-wreck', -2);
    this.mech.view.setAlpha(1);
    this.mech.airlift(); // drops the shield bubble
    this.mech.view.setVisible(true);
    fx.explosion(this.x, this.y, 1.4);
    play('bigExplode', 0.7);
  }
}
