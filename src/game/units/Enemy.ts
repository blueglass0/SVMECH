import Phaser from 'phaser';
import type { Circle, CollisionWorld } from '../../core/collision';
import { DEG, approachAngle, wrapAngle, type Vec } from '../../core/math';
import type { CombatDifficulty } from '../../data/difficulty';
import type { EnemyDef } from '../../data/enemies';
import { WEAPONS, type WeaponDef } from '../../data/weapons';
import { ART_SCALE } from '../art';
import type { Combat } from '../combat/Combat';
import type { Effects } from '../combat/Effects';
import type { Team, Unit } from '../combat/types';
import type { NavGrid } from '../world/NavGrid';
import type { Mech } from './Mech';

export interface AiContext {
  player: Mech;
  world: CollisionWorld;
  nav: NavGrid;
  combat: Combat;
  fx: Effects;
  /** Everything that blocks movement (player and living enemies). */
  bodies: readonly Circle[];
  difficulty: CombatDifficulty;
}

export type Detection = 'visible' | 'radar' | 'hidden';

/** How often enemies re-check whether they can see the player, seconds. */
const SENSE_INTERVAL = 0.25;
/** After losing sight this long (and reaching the last seen spot), enemies give up the chase. */
export const GIVE_UP_AFTER = 10;
const BAR_WIDTH = 44;

/** Shared parts of tanks, turrets and structures: HP, health bar, death. */
export abstract class Enemy implements Unit {
  readonly team: Team = 'enemy';
  alive = true;
  hp: number;
  maxHp: number;
  radius: number;
  /** Has spotted the player (or been alerted) and is fighting. */
  engaged = false;
  /** Could see the player at the last sense check. */
  canSee = false;
  /** Flies over terrain and units (drones): doesn't block movement. */
  flying = false;
  protected senseTimer = Math.random() * SENSE_INTERVAL;
  protected lostTimer = 0;
  protected lastSeen: Vec = { x: 0, y: 0 };
  protected barBg: Phaser.GameObjects.Image;
  protected barFill: Phaser.GameObjects.Image;
  /** Fog of war: what the player currently knows about this unit. */
  detection: Detection = 'visible';
  /** Mission time the player last saw it (-Infinity = never). */
  lastSeenAt = -Infinity;
  private seenX = 0;
  private seenY = 0;
  private ghost?: Phaser.GameObjects.Image;
  private blip?: Phaser.GameObjects.Image;

  constructor(
    protected scene: Phaser.Scene,
    readonly def: EnemyDef,
    public x: number,
    public y: number,
  ) {
    this.hp = this.maxHp = def.hp;
    this.radius = def.radius;
    this.barBg = scene.add.image(0, 0, 'px-bg').setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.barFill = scene.add.image(0, 0, 'px-enemy').setOrigin(0, 0.5).setDepth(11).setVisible(false);
  }

  abstract update(dt: number, ctx: AiContext): void;
  protected abstract onDestroyed(ctx: Effects): void;
  /** The sprites that show this unit (hidden by fog of war). */
  protected abstract parts(): Phaser.GameObjects.Image[];

  /** Show or hide the unit (fog of war). Units made of more than plain sprites override this. */
  protected showParts(visible: boolean): void {
    for (const p of this.parts()) p.setVisible(visible);
  }

  /** Move the unit (dev spawns). */
  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /**
   * Fog of war. Visible: drawn normally. Radar: a blip. Hidden: a fading
   * marker where it was last seen (turrets and targets keep theirs; they don't move).
   */
  setDetection(level: Detection, now: number): void {
    if (!this.alive) return;
    this.detection = level;
    const visible = level === 'visible';
    this.showParts(visible);
    if (visible) {
      this.seenX = this.x;
      this.seenY = this.y;
      this.lastSeenAt = now;
    }
    if (level === 'radar' || this.blip) {
      this.blip ??= this.scene.add.image(0, 0, 'blip').setScale(1 / ART_SCALE).setDepth(14);
      this.blip.setVisible(level === 'radar').setPosition(this.x, this.y);
    }
    const remembered = !visible && level !== 'radar' && this.lastSeenAt > -Infinity;
    if (remembered || this.ghost) {
      this.ghost ??= this.scene.add.image(0, 0, 'ghost').setScale(1 / ART_SCALE).setDepth(14);
      const age = now - this.lastSeenAt;
      // Things that move fade from memory; turrets and targets stay marked.
      // Drones dart about, so their markers go stale quickly.
      const moves = this.def.kind !== 'turret' && this.def.kind !== 'structure';
      const fade = this.def.kind === 'drone' ? 1.5 : 6;
      const alpha = moves ? 0.55 * Math.max(0, 1 - age / fade) : 0.5;
      this.ghost.setVisible(remembered && alpha > 0).setPosition(this.seenX, this.seenY).setAlpha(alpha);
    }
    this.updateBar();
  }

  /** Alert this unit to the player's position (heard combat nearby, or got shot). */
  alert(at: Vec): void {
    if (!this.alive || this.def.detectRange <= 0) return;
    this.engaged = true;
    this.lostTimer = 0;
    this.lastSeen.x = at.x;
    this.lastSeen.y = at.y;
  }

  takeDamage(amount: number, fromX: number, fromY: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.alert({ x: fromX, y: fromY });
    this.updateBar();
    if (this.hp === 0) this.alive = false;
  }

  /** Called by the scene once, on the frame the unit dies. */
  destroy(fx: Effects): void {
    this.barBg.setVisible(false);
    this.barFill.setVisible(false);
    this.ghost?.setVisible(false);
    this.blip?.setVisible(false);
    this.onDestroyed(fx);
    // Wrecks are terrain: always shown, even if the unit died out of sight.
    this.showParts(true);
  }

  protected updateBar(): void {
    const show = this.alive && this.hp < this.maxHp && this.detection === 'visible';
    const y = this.y - this.radius - 14;
    this.barBg.setVisible(show).setPosition(this.x - BAR_WIDTH / 2 - 1, y).setDisplaySize(BAR_WIDTH + 2, 6);
    this.barFill
      .setVisible(show)
      .setPosition(this.x - BAR_WIDTH / 2, y)
      .setDisplaySize(Math.max(1, BAR_WIDTH * (this.hp / this.maxHp)), 4);
  }

  /** Line-of-sight check against the player, throttled. */
  protected sense(dt: number, ctx: AiContext): void {
    this.senseTimer -= dt;
    if (this.senseTimer > 0) return;
    this.senseTimer = SENSE_INTERVAL;
    const p = ctx.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    // Already-engaged units keep tracking a bit beyond detection range.
    const range = this.def.detectRange * (this.engaged ? 1.3 : 1);
    this.canSee = p.alive && d <= range && ctx.world.lineOfSight(this.x, this.y, p.x, p.y);
    if (this.canSee) {
      this.engaged = true;
      this.lostTimer = 0;
      this.lastSeen.x = p.x;
      this.lastSeen.y = p.y;
    } else if (this.engaged) {
      this.lostTimer += SENSE_INTERVAL;
    }
    if (!p.alive) this.engaged = false;
  }

  /** Angle to aim at the player, leading a moving target by `aimLead`. */
  protected aimAngle(fromX: number, fromY: number, w: WeaponDef, p: Mech): number {
    const d = Math.hypot(p.x - fromX, p.y - fromY);
    const t = w.projectileSpeed > 0 ? d / w.projectileSpeed : 0;
    const lead = this.def.aimLead ?? 0;
    return Math.atan2(p.y + p.vy * t * lead - fromY, p.x + p.vx * t * lead - fromX);
  }
}

/** Armed unit with a rotating gun: shared by tanks, turrets and drones. */
export abstract class Gunner extends Enemy {
  protected weapon: WeaponDef;
  gunAngle: number;
  protected cooldown = Math.random();

  constructor(scene: Phaser.Scene, def: EnemyDef, x: number, y: number, angle: number) {
    super(scene, def, x, y);
    this.weapon = WEAPONS[def.weapon!];
    this.gunAngle = angle;
  }

  /** Distance to where the shot is aimed (the led target point): splash shells burst there. */
  protected aimDistance(p: Mech): number {
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.weapon.projectileSpeed <= 0) return d;
    const t = d / this.weapon.projectileSpeed;
    const lead = this.def.aimLead ?? 0;
    return Math.hypot(p.x + p.vx * t * lead - this.x, p.y + p.vy * t * lead - this.y);
  }

  /** Turn the gun toward the player (or `idleAngle`) and fire when lined up. */
  protected aimAndFire(dt: number, ctx: AiContext, idleAngle: number, muzzle: number): void {
    const p = ctx.player;
    const want = this.engaged && p.alive ? this.aimAngle(this.x, this.y, this.weapon, p) : idleAngle;
    this.gunAngle = wrapAngle(approachAngle(this.gunAngle, want, (this.def.turretTurnRate ?? 90) * DEG * dt));
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.canSee || this.cooldown > 0) return;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (d > this.weapon.range || Math.abs(wrapAngle(want - this.gunAngle)) > 6 * DEG) return;
    const mx = this.x + Math.cos(this.gunAngle) * muzzle;
    const my = this.y + Math.sin(this.gunAngle) * muzzle;
    ctx.combat.fire(mx, my, this.gunAngle, this.weapon, 'enemy', ctx.difficulty.enemyDamage, ctx.difficulty.enemySpread, this.aimDistance(p) - muzzle, p);
    // A little randomness so groups don't fire in lockstep.
    this.cooldown = (1 / this.weapon.fireRate) * (0.85 + Math.random() * 0.3);
  }
}

/**
 * A* path following for ground units: holds a goal, re-plans every ~1.5 s
 * (or when the goal moves), and hands out the next waypoint.
 */
export class PathFollower {
  goal: Vec = { x: 0, y: 0 };
  hasGoal = false;
  /** Seconds until the next re-plan (set to 0 to re-plan now). */
  repath = 0;
  private path: Vec[] = [];
  private index = 0;

  setGoal(x: number, y: number): void {
    if (!this.hasGoal || Math.hypot(this.goal.x - x, this.goal.y - y) > 120) this.repath = 0;
    this.goal.x = x;
    this.goal.y = y;
    this.hasGoal = true;
  }

  clear(): void {
    this.hasGoal = false;
  }

  /** The waypoint to head for, or null when there is no goal (or it was reached or unreachable). */
  next(x: number, y: number, dt: number, nav: NavGrid): Vec | null {
    if (!this.hasGoal) return null;
    this.repath -= dt;
    if (this.repath <= 0 || this.index >= this.path.length) {
      this.repath = 1.5 + Math.random() * 0.5;
      this.index = 0;
      if (!nav.findPath(x, y, this.goal.x, this.goal.y, this.path)) {
        this.hasGoal = false;
        return null;
      }
    }
    while (this.index < this.path.length && Math.hypot(this.path[this.index].x - x, this.path[this.index].y - y) <= 30) this.index++;
    if (this.index >= this.path.length) {
      this.hasGoal = false;
      return null;
    }
    return this.path[this.index];
  }
}

