import Phaser from 'phaser';
import type { Vec } from '../../core/math';
import { DEG, approach, approachAngle, wrapAngle } from '../../core/math';
import { play } from '../../core/audio';
import { ENEMIES, type EnemyDef } from '../../data/enemies';
import { ART_SCALE } from '../art';
import type { Effects } from '../combat/Effects';
import { Enemy, Gunner, GIVE_UP_AFTER, type AiContext } from './Enemy';
import { Drone } from './Drone';
import { EnemyMech } from './EnemyMech';

export { Enemy, PathFollower, type AiContext, type Detection } from './Enemy';
export { Drone } from './Drone';
export { EnemyMech } from './EnemyMech';

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
    skin = '',
  ) {
    super(scene, def, x, y, angle);
    this.hullAngle = angle;
    this.body = def.art?.body ?? 'tank-hull';
    this.hull = scene.add.image(x, y, this.body + skin).setScale(1 / ART_SCALE).setDepth(4);
    this.gun = scene.add.image(x, y, (def.art?.gun ?? 'tank-turret') + skin).setScale(1 / ART_SCALE).setDepth(5);
  }
  private body: string;
  /** Convoy raid: the truck this tank guards (it follows until it spots you). */
  escortOf?: Truck;
  private escortSide = (Math.random() < 0.5 ? -1 : 1) * 60;

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    this.sense(dt, ctx);
    const f = this.foe;
    const d = Math.hypot(f.x - this.x, f.y - this.y) - (f === ctx.player ? 0 : f.radius);

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
    let targetAngle = this.engaged && this.canSee ? Math.atan2(f.y - this.y, f.x - this.x) : this.hullAngle;
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
    ctx.world.resolveCircle(pos, this.radius, ctx.bodies, this, this.def.crushTonnage ?? 0);
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
    // Convoy escort: ride behind the truck it guards.
    if (this.escortOf?.alive) {
      const t = this.escortOf;
      this.setGoal(t.x - Math.cos(t.heading) * 110 + Math.cos(t.heading + Math.PI / 2) * this.escortSide, t.y - Math.sin(t.heading) * 110 + Math.sin(t.heading + Math.PI / 2) * this.escortSide);
      return;
    }
    if (this.hasGoal) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = 2 + Math.random() * 3;
    const a = Math.random() * Math.PI * 2;
    const r = 120 + Math.random() * 280;
    this.setGoal(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r);
  }

  protected parts(): Phaser.GameObjects.Image[] {
    return this.alive ? [this.hull, this.gun] : [this.hull];
  }

  protected onDestroyed(fx: Effects): void {
    this.hull.setTexture(this.body + '-wreck').setDepth(2);
    this.gun.setVisible(false);
    fx.explosion(this.x, this.y, 1);
  }
}

export class Turret extends Gunner {
  private base: Phaser.GameObjects.Image;
  private gun: Phaser.GameObjects.Image;
  private idleAngle: number;

  constructor(scene: Phaser.Scene, def: EnemyDef, x: number, y: number, angle: number, skin = '') {
    super(scene, def, x, y, angle);
    this.idleAngle = angle;
    this.base = scene.add.image(x, y, 'turret-base' + skin).setScale(1 / ART_SCALE).setDepth(4);
    const tex = def.art?.gun ?? (def.weapon === 'turretCannon' ? 'turret-cannon' : 'turret-gun');
    this.gun = scene.add.image(x, y, tex + skin).setScale(1 / ART_SCALE).setDepth(5).setRotation(angle);
  }

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    this.sense(dt, ctx);
    if (this.engaged && this.lostTimer > GIVE_UP_AFTER) this.engaged = false;
    this.aimAndFire(dt, ctx, this.idleAngle, 28);
    this.gun.setRotation(this.gunAngle);
  }

  protected parts(): Phaser.GameObjects.Image[] {
    return this.alive ? [this.base, this.gun] : [this.base];
  }

  protected onDestroyed(fx: Effects): void {
    this.base.setTexture('turret-base-wreck').setDepth(2);
    this.gun.setVisible(false);
    fx.explosion(this.x, this.y, 0.9);
  }
}

/**
 * Convoy truck (raid missions): unarmed, follows the road (a nav path) at a steady pace,
 * keeping its distance from the truck ahead. Reaching the end of the road = it got away.
 */
export class Truck extends Enemy {
  heading: number;
  /** Got off the map: not a kill. */
  escaped = false;
  /** The convoy waits until this is set. */
  started = false;
  path: Vec[] = [];
  /** The truck in front, to keep spacing. */
  ahead: Truck | null = null;
  spacing = 90;
  private index = 0;
  private speed = 0;
  private img: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, def: EnemyDef, x: number, y: number, angle: number, skin = '') {
    super(scene, def, x, y);
    this.heading = angle;
    this.img = scene.add.image(x, y, 'truck' + skin).setScale(1 / ART_SCALE).setDepth(4).setRotation(angle);
  }

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    let targetSpeed = 0;
    if (this.started) {
      while (this.index < this.path.length && Math.hypot(this.path[this.index].x - this.x, this.path[this.index].y - this.y) < 40) this.index++;
      if (this.index >= this.path.length) {
        this.escaped = true;
        this.alive = false;
        return;
      }
      const wp = this.path[this.index];
      const want = Math.atan2(wp.y - this.y, wp.x - this.x);
      this.heading = wrapAngle(approachAngle(this.heading, want, (this.def.hullTurnRate ?? 70) * DEG * dt));
      targetSpeed = (this.def.speed ?? 50) * Math.max(0, Math.cos(wrapAngle(want - this.heading)));
      const a = this.ahead;
      if (a && a.alive && Math.hypot(a.x - this.x, a.y - this.y) < this.spacing) targetSpeed = 0;
    }
    this.speed = approach(this.speed, targetSpeed, (this.def.accel ?? 60) * dt);
    const pos = { x: this.x + Math.cos(this.heading) * this.speed * dt, y: this.y + Math.sin(this.heading) * this.speed * dt };
    ctx.world.resolveCircle(pos, this.radius, ctx.bodies, this, this.def.crushTonnage ?? 0);
    this.x = pos.x;
    this.y = pos.y;
    this.img.setPosition(this.x, this.y).setRotation(this.heading);
    if (this.hp < this.maxHp) this.updateBar();
  }

  /** Got away: leave the map without a wreck. */
  vanish(): void {
    this.img.setVisible(false);
    this.barBg.setVisible(false);
    this.barFill.setVisible(false);
    this.setDetection('hidden', -Infinity);
  }

  protected parts(): Phaser.GameObjects.Image[] {
    return [this.img];
  }

  protected onDestroyed(fx: Effects): void {
    this.img.setTexture('truck-wreck').setDepth(2);
    fx.explosion(this.x, this.y, 1.1);
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

  protected parts(): Phaser.GameObjects.Image[] {
    return [this.img];
  }

  protected onDestroyed(fx: Effects): void {
    this.img.setTexture('uplink-wreck').setAlpha(1).setDepth(2);
    fx.explosion(this.x, this.y, 1.8);
    play('bigExplode', 1);
  }
}

/** `skin`: the enemy army's colour suffix ('' neutral, '-royal', '-tech', '-free'; see art.ts). */
export function createEnemy(scene: Phaser.Scene, type: string, x: number, y: number, angle: number, home?: Vec, skin = ''): Enemy {
  const def = ENEMIES[type];
  switch (def.kind) {
    case 'tank':
      return new Tank(scene, def, x, y, angle, home ?? { x, y }, skin);
    case 'turret':
      return new Turret(scene, def, x, y, angle, skin);
    case 'structure':
      return new Structure(scene, def, x, y);
    case 'drone':
      return new Drone(scene, def, x, y, angle, home ?? { x, y }, skin);
    case 'mech':
      return new EnemyMech(scene, def, x, y, angle, home ?? { x, y }, skin);
    case 'truck':
      return new Truck(scene, def, x, y, angle, skin);
  }
}
