import Phaser from 'phaser';
import type { Circle, CollisionWorld } from '../../core/collision';
import { DEG, approach, approachAngle, wrapAngle, type Vec } from '../../core/math';
import { play } from '../../core/audio';
import type { CombatDifficulty } from '../../data/difficulty';
import { ENEMIES, type EnemyDef } from '../../data/enemies';
import { WEAPONS, type WeaponDef } from '../../data/weapons';
import { ART_SCALE } from '../art';
import type { Combat } from '../combat/Combat';
import type { Effects } from '../combat/Effects';
import type { Team, Unit } from '../combat/types';
import type { NavGrid } from '../world/NavGrid';
import type { PlayerMech } from './PlayerMech';

export interface AiContext {
  player: PlayerMech;
  world: CollisionWorld;
  nav: NavGrid;
  combat: Combat;
  fx: Effects;
  /** Everything that blocks movement (player and living enemies). */
  bodies: readonly Circle[];
  difficulty: CombatDifficulty;
}

/** How often enemies re-check whether they can see the player, seconds. */
const SENSE_INTERVAL = 0.25;
/** After losing sight this long (and reaching the last seen spot), enemies give up the chase. */
const GIVE_UP_AFTER = 10;
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
  protected senseTimer = Math.random() * SENSE_INTERVAL;
  protected lostTimer = 0;
  protected lastSeen: Vec = { x: 0, y: 0 };
  private barBg: Phaser.GameObjects.Image;
  private barFill: Phaser.GameObjects.Image;

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
    this.onDestroyed(fx);
  }

  protected updateBar(): void {
    const show = this.alive && this.hp < this.maxHp;
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
  protected aimAngle(fromX: number, fromY: number, w: WeaponDef, p: PlayerMech): number {
    const d = Math.hypot(p.x - fromX, p.y - fromY);
    const t = w.projectileSpeed > 0 ? d / w.projectileSpeed : 0;
    const lead = this.def.aimLead ?? 0;
    return Math.atan2(p.y + p.vy * t * lead - fromY, p.x + p.vx * t * lead - fromX);
  }
}

/** Armed unit with a rotating gun: shared by tanks and turrets. */
abstract class Gunner extends Enemy {
  protected weapon: WeaponDef;
  gunAngle: number;
  protected cooldown = Math.random();

  constructor(scene: Phaser.Scene, def: EnemyDef, x: number, y: number, angle: number) {
    super(scene, def, x, y);
    this.weapon = WEAPONS[def.weapon!];
    this.gunAngle = angle;
  }

  /** Distance to where the shot is aimed (the led target point): splash shells burst there. */
  protected aimDistance(p: PlayerMech): number {
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
    ctx.combat.fire(mx, my, this.gunAngle, this.weapon, 'enemy', ctx.difficulty.enemyDamage, ctx.difficulty.enemySpread, this.aimDistance(p) - muzzle);
    // A little randomness so groups don't fire in lockstep.
    this.cooldown = (1 / this.weapon.fireRate) * (0.85 + Math.random() * 0.3);
  }
}

export class Tank extends Gunner {
  hullAngle: number;
  private speed = 0;
  private path: Vec[] = [];
  private pathIndex = 0;
  private repath = 0;
  private goal: Vec = { x: 0, y: 0 };
  private hasGoal = false;
  private wait = 0;
  private stuck = 0;
  private hull: Phaser.GameObjects.Image;
  private gun: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    def: EnemyDef,
    x: number,
    y: number,
    angle: number,
    private home: Vec,
  ) {
    super(scene, def, x, y, angle);
    this.hullAngle = angle;
    this.hull = scene.add.image(x, y, 'tank-hull').setScale(1 / ART_SCALE).setDepth(4);
    this.gun = scene.add.image(x, y, 'tank-turret').setScale(1 / ART_SCALE).setDepth(5);
  }

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    this.sense(dt, ctx);
    const d = Math.hypot(ctx.player.x - this.x, ctx.player.y - this.y);

    // Pick where to go.
    if (this.engaged) {
      if (this.lostTimer > GIVE_UP_AFTER && Math.hypot(this.lastSeen.x - this.x, this.lastSeen.y - this.y) < 80) {
        this.engaged = false;
        this.hasGoal = false;
      } else if (this.canSee && d <= (this.def.preferredRange ?? 350)) {
        this.hasGoal = false; // in range with a clear shot: hold and fire
      } else {
        this.setGoal(this.lastSeen.x, this.lastSeen.y);
      }
    }
    if (!this.engaged) this.patrol(dt);

    // Follow the path.
    let targetSpeed = 0;
    let targetAngle = this.engaged && this.canSee ? Math.atan2(ctx.player.y - this.y, ctx.player.x - this.x) : this.hullAngle;
    if (this.hasGoal) {
      this.repath -= dt;
      if (this.repath <= 0 || this.pathIndex >= this.path.length) {
        this.repath = 1.5 + Math.random() * 0.5;
        this.pathIndex = 0;
        if (!ctx.nav.findPath(this.x, this.y, this.goal.x, this.goal.y, this.path)) this.hasGoal = false;
      }
      while (this.pathIndex < this.path.length) {
        const wp = this.path[this.pathIndex];
        if (Math.hypot(wp.x - this.x, wp.y - this.y) > 30) break;
        this.pathIndex++;
      }
      if (this.pathIndex < this.path.length) {
        const wp = this.path[this.pathIndex];
        targetAngle = Math.atan2(wp.y - this.y, wp.x - this.x);
        const diff = wrapAngle(targetAngle - this.hullAngle);
        targetSpeed = (this.def.speed ?? 100) * Math.max(0, Math.cos(diff));
      } else {
        this.hasGoal = false;
      }
    }

    this.hullAngle = wrapAngle(approachAngle(this.hullAngle, targetAngle, (this.def.hullTurnRate ?? 90) * DEG * dt));
    this.speed = approach(this.speed, targetSpeed, (this.def.accel ?? 100) * dt);
    const pos = { x: this.x + Math.cos(this.hullAngle) * this.speed * dt, y: this.y + Math.sin(this.hullAngle) * this.speed * dt };
    ctx.world.resolveCircle(pos, this.radius, ctx.bodies, this);
    const moved = Math.hypot(pos.x - this.x, pos.y - this.y);
    this.x = pos.x;
    this.y = pos.y;

    // Wedged against something: find a new route.
    this.stuck = targetSpeed > 20 && moved < targetSpeed * dt * 0.2 ? this.stuck + dt : 0;
    if (this.stuck > 1) {
      this.stuck = 0;
      this.repath = 0;
      this.speed = 0;
    }

    this.aimAndFire(dt, ctx, this.hullAngle, 26);
    this.hull.setPosition(this.x, this.y).setRotation(this.hullAngle);
    this.gun.setPosition(this.x, this.y).setRotation(this.gunAngle);
    if (this.hp < this.maxHp) this.updateBar();
  }

  private setGoal(x: number, y: number): void {
    if (!this.hasGoal || Math.hypot(this.goal.x - x, this.goal.y - y) > 120) this.repath = 0;
    this.goal.x = x;
    this.goal.y = y;
    this.hasGoal = true;
  }

  /** Wander between points near home, pausing at each. */
  private patrol(dt: number): void {
    if (this.hasGoal) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 2 + Math.random() * 3;
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 280;
    this.setGoal(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }

  protected onDestroyed(fx: Effects): void {
    this.hull.setTexture('tank-hull-wreck').setDepth(2);
    this.gun.setVisible(false);
    fx.explosion(this.x, this.y, 1);
  }
}

export class Turret extends Gunner {
  private base: Phaser.GameObjects.Image;
  private gun: Phaser.GameObjects.Image;
  private idleAngle: number;

  constructor(scene: Phaser.Scene, def: EnemyDef, x: number, y: number, angle: number) {
    super(scene, def, x, y, angle);
    this.idleAngle = angle;
    this.base = scene.add.image(x, y, 'turret-base').setScale(1 / ART_SCALE).setDepth(4);
    const tex = def.weapon === 'turretCannon' ? 'turret-cannon' : 'turret-gun';
    this.gun = scene.add.image(x, y, tex).setScale(1 / ART_SCALE).setDepth(5).setRotation(angle);
  }

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    this.sense(dt, ctx);
    if (this.engaged && this.lostTimer > GIVE_UP_AFTER) this.engaged = false;
    this.aimAndFire(dt, ctx, this.idleAngle, 28);
    this.gun.setRotation(this.gunAngle);
  }

  protected onDestroyed(fx: Effects): void {
    this.base.setTexture('turret-base-wreck').setDepth(2);
    this.gun.setVisible(false);
    fx.explosion(this.x, this.y, 0.9);
  }
}

/** Mission target: no weapon, just HP. */
export class Structure extends Enemy {
  private img: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, def: EnemyDef, x: number, y: number) {
    super(scene, def, x, y);
    this.img = scene.add.image(x, y, 'uplink').setScale(1 / ART_SCALE).setDepth(4);
  }

  update(): void {
    // Static. The pulse is purely visual.
  }

  pulse(time: number): void {
    if (this.alive) this.img.setAlpha(0.85 + Math.sin(time * 0.004) * 0.15);
  }

  protected onDestroyed(fx: Effects): void {
    this.img.setTexture('uplink-wreck').setAlpha(1).setDepth(2);
    fx.explosion(this.x, this.y, 1.8);
    play('bigExplode', 1);
  }
}

export function createEnemy(scene: Phaser.Scene, type: string, x: number, y: number, angle: number, home?: Vec): Enemy {
  const def = ENEMIES[type];
  switch (def.kind) {
    case 'tank':
      return new Tank(scene, def, x, y, angle, home ?? { x, y });
    case 'turret':
      return new Turret(scene, def, x, y, angle);
    case 'structure':
      return new Structure(scene, def, x, y);
  }
}
