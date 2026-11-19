import Phaser from 'phaser';
import type { Circle, CollisionWorld } from '../../core/collision';
import type { ControlScheme } from '../../core/settings';
import type { Vec } from '../../core/math';
import { CHASSIS, type ChassisDef, type ChassisMovement, type MountDef } from '../../data/chassis';
import { HEAT_RULES, type Loadout } from '../../data/loadouts';
import { WEAPONS, type WeaponDef } from '../../data/weapons';
import { MechMotor } from '../MechMotor';
import { MechView } from '../MechView';
import type { Combat } from '../combat/Combat';
import type { Team, Unit } from '../combat/types';

export interface MountedWeapon {
  def: WeaponDef;
  mount: MountDef;
  group: 1 | 2;
  /** Seconds until it can fire again. */
  cooldown: number;
}

const NO_INPUT: Vec = { x: 0, y: 0 };

/** The player's mech in combat: movement, weapons, heat, ammo and armor. */
export class PlayerMech implements Unit {
  readonly team: Team = 'player';
  alive = true;
  hp: number;
  maxHp: number;
  radius: number;
  readonly chassis: ChassisDef;
  motor: MechMotor;
  view: MechView;
  weapons: MountedWeapon[];
  heat = 0;
  /** Seconds of shutdown left (0 = running). */
  shutdown = 0;
  ammo: { ballistic: number; missile: number };
  invulnerable = false;
  /** Set when damaged, for HUD and camera feedback. */
  lastHit = 0;
  stats = { shots: 0, damageTaken: 0, ammoUsed: 0 };

  constructor(scene: Phaser.Scene, loadout: Loadout, movement: ChassisMovement, x: number, y: number, angle: number) {
    this.chassis = CHASSIS[loadout.chassis];
    this.radius = this.chassis.radius;
    this.hp = this.maxHp = this.chassis.armor;
    this.ammo = { ...this.chassis.ammoCapacity };
    this.motor = new MechMotor(movement, this.radius, x, y, angle);
    this.view = new MechView(scene, this.motor, true);
    this.weapons = loadout.weapons.map((w) => ({
      def: WEAPONS[w.weapon],
      mount: this.chassis.mounts.find((m) => m.id === w.mount)!,
      group: w.group,
      cooldown: 0,
    }));
  }

  get x(): number {
    return this.motor.pos.x;
  }
  get y(): number {
    return this.motor.pos.y;
  }

  /** World-space velocity, for enemies leading their shots. */
  get vx(): number {
    return Math.cos(this.motor.legAngle) * this.motor.speed;
  }
  get vy(): number {
    return Math.sin(this.motor.legAngle) * this.motor.speed;
  }

  update(
    dt: number,
    scheme: ControlScheme,
    move: Vec,
    aimTarget: Vec | null,
    fire1: boolean,
    fire2: boolean,
    world: CollisionWorld,
    bodies: readonly Circle[],
    combat: Combat,
  ): boolean {
    if (!this.alive) return false;
    const c = this.chassis;

    // Heat: shed continuously, faster while shut down.
    const cooling = c.heatDissipation * (this.shutdown > 0 ? HEAT_RULES.shutdownCoolingMultiplier : 1);
    this.heat = Math.max(0, this.heat - cooling * dt);
    if (this.shutdown > 0) {
      this.shutdown = Math.max(0, this.shutdown - dt);
      if (this.shutdown === 0) this.view.setAlpha(1);
    }
    const running = this.shutdown === 0;

    const stepped = this.motor.update(dt, scheme, running ? move : NO_INPUT, running ? aimTarget : null, world, bodies, this);

    for (const w of this.weapons) {
      w.cooldown = Math.max(0, w.cooldown - dt);
      const held = w.group === 1 ? fire1 : fire2;
      if (!held || !running || w.cooldown > 0) continue;
      const pool = w.def.family === 'missile' ? 'missile' : 'ballistic';
      if (w.def.ammoPerShot > 0 && this.ammo[pool] < w.def.ammoPerShot) continue;
      this.fireWeapon(w, combat);
      if (w.def.ammoPerShot > 0) {
        this.ammo[pool] -= w.def.ammoPerShot;
        this.stats.ammoUsed += w.def.ammoPerShot;
      }
      this.heat += w.def.heat;
      this.stats.shots++;
      w.cooldown = 1 / w.def.fireRate;
    }

    if (running && this.heat >= c.heatCapacity) {
      this.shutdown = HEAT_RULES.shutdownTime;
      this.view.setAlpha(0.55);
    }

    this.view.update(dt);
    return stepped;
  }

  /** Fraction 0..1 of the way to overheating. */
  get heatFraction(): number {
    return Math.min(1, this.heat / this.chassis.heatCapacity);
  }

  takeDamage(amount: number): void {
    if (!this.alive || this.invulnerable) return;
    this.hp = Math.max(0, this.hp - amount);
    this.stats.damageTaken += amount;
    this.lastHit = performance.now();
    if (this.hp === 0) {
      this.alive = false;
      this.view.setAlpha(0.25);
      this.view.setMarkersVisible(false);
    }
  }

  refill(): void {
    this.ammo = { ...this.chassis.ammoCapacity };
    this.heat = 0;
    this.shutdown = 0;
    this.hp = this.maxHp;
    this.view.setAlpha(1);
  }

  private fireWeapon(w: MountedWeapon, combat: Combat): void {
    const m = this.motor;
    const ca = Math.cos(m.torsoAngle);
    const sa = Math.sin(m.torsoAngle);
    const mx = m.pos.x + w.mount.x * ca - w.mount.y * sa;
    const my = m.pos.y + w.mount.x * sa + w.mount.y * ca;
    combat.fire(mx, my, m.torsoAngle, w.def, 'player');
  }
}
