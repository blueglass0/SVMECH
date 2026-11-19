import Phaser from 'phaser';
import type { Circle, CollisionWorld } from '../../core/collision';
import type { ControlScheme } from '../../core/settings';
import type { Vec } from '../../core/math';
import { CHASSIS, type ChassisDef, type ChassisMovement, type MountDef, type Section } from '../../data/chassis';
import { SectionDamage } from './SectionDamage';
import { HEAT_RULES } from '../../data/loadouts';
import type { MechState } from '../../career/types';
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
  /** The arm it was mounted on was destroyed. */
  destroyed: boolean;
}

const NO_INPUT: Vec = { x: 0, y: 0 };

/** The player's mech in combat: movement, weapons, heat, ammo and armor. */
export class PlayerMech implements Unit {
  readonly team: Team = 'player';
  alive = true;
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
  /** Per-section armor. */
  sections: SectionDamage;
  /** Set when damaged, for HUD and camera feedback. */
  lastHit = 0;
  /** World angle the last hit came from (radians), for the HUD direction marker. */
  lastHitAngle = 0;
  /** Called when a section is destroyed (explosion effects, HUD labels). */
  onSectionDestroyed?: (section: Section) => void;
  stats = { shots: 0, damageTaken: 0, ammoUsed: 0 };

  constructor(scene: Phaser.Scene, state: MechState, movement: ChassisMovement, x: number, y: number, angle: number) {
    this.chassis = CHASSIS[state.chassis];
    this.radius = this.chassis.radius;
    this.sections = new SectionDamage(this.chassis.sections);
    // Carry damage over from earlier missions (unrepaired sections).
    this.sections.hp = { ...state.sections };
    this.ammo = { ...state.ammo };
    this.motor = new MechMotor(movement, this.radius, x, y, angle);
    this.view = new MechView(scene, this.motor, true);
    this.weapons = state.weapons.map((w) => ({
      def: WEAPONS[w.weapon],
      mount: this.chassis.mounts.find((m) => m.id === w.mount)!,
      group: w.group,
      cooldown: 0,
      destroyed: false,
    }));
    for (const side of ['leftArm', 'rightArm'] as const) {
      if (this.sections.destroyed(side)) {
        for (const w of this.weapons) if (w.mount.section === side) w.destroyed = true;
        this.view.setArm(side, false);
      }
    }
    this.updateLegs();
  }

  /** The mech's state to carry back to the career after the mission. */
  toState(): MechState {
    return {
      chassis: this.chassis.id,
      weapons: this.weapons.map((w) => ({ mount: w.mount.id, weapon: w.def.id, group: w.group })),
      sections: { ...this.sections.hp },
      ammo: { ...this.ammo },
      destroyed: !this.alive,
    };
  }

  /** Total armor left (Unit interface; enemies don't use it for the player). */
  get hp(): number {
    return this.sections.total;
  }
  get maxHp(): number {
    return this.sections.totalMax;
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
      if (!held || !running || w.cooldown > 0 || w.destroyed) continue;
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

  takeDamage(amount: number, fromX: number, fromY: number, hitX?: number, hitY?: number): void {
    if (!this.alive) return;
    const worldAngle = Math.atan2(fromY - this.y, fromX - this.x);
    this.lastHit = performance.now();
    this.lastHitAngle = worldAngle;
    if (this.invulnerable) return;
    const before = this.sections.total;
    // The section is picked by where the shot struck the mech's outline: arms are either
    // side of the torso, so off-centre hits from the front land on an arm.
    const strike = hitX !== undefined && hitY !== undefined ? Math.atan2(hitY - this.y, hitX - this.x) : worldAngle;
    const hit = this.sections.apply(amount, strike - this.motor.torsoAngle);
    this.stats.damageTaken += before - this.sections.total;
    for (const s of hit.destroyed) this.loseSection(s);
    this.updateLegs();
  }

  takeSplash(amount: number): void {
    if (!this.alive || this.invulnerable) return;
    const before = this.sections.total;
    const hit = this.sections.applySplash(amount);
    this.stats.damageTaken += before - this.sections.total;
    for (const s of hit.destroyed) this.loseSection(s);
    this.updateLegs();
  }

  /** Dev tool: damage one section directly. */
  damageSection(section: Section, amount: number): void {
    const rel = { torso: 0, rightArm: Math.PI / 2, leftArm: -Math.PI / 2, legs: 0 }[section];
    if (section === 'legs') {
      this.sections.hp.legs = Math.max(0, this.sections.hp.legs - amount);
      if (this.sections.hp.legs === 0) this.loseSection('legs');
    } else {
      const hit = this.sections.apply(amount, rel);
      for (const s of hit.destroyed) this.loseSection(s);
    }
    this.lastHit = performance.now();
    this.updateLegs();
  }

  refill(): void {
    this.ammo = { ...this.chassis.ammoCapacity };
    this.heat = 0;
    this.shutdown = 0;
    this.sections.repairAll();
    for (const w of this.weapons) w.destroyed = false;
    this.view.setArm('leftArm', true);
    this.view.setArm('rightArm', true);
    this.view.setAlpha(1);
    this.updateLegs();
  }

  private loseSection(s: Section): void {
    if (s === 'torso') {
      this.alive = false;
      this.view.setAlpha(0.25);
      this.view.setMarkersVisible(false);
    } else if (s === 'leftArm' || s === 'rightArm') {
      for (const w of this.weapons) if (w.mount.section === s) w.destroyed = true;
      this.view.setArm(s, false);
    }
    this.onSectionDestroyed?.(s);
  }

  /** Leg damage slows the mech. */
  updateLegs(): void {
    const f = this.sections.legFactors();
    this.motor.speedFactor = f.speed;
    this.motor.turnFactor = f.turn;
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
