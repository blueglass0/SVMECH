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
import { mechStats, type MechStats } from '../mechStats';
import { play } from '../../core/audio';
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
  /** Spin-up weapons: 0..1 of the way to full fire rate. */
  spin: number;
  /** Continuous beams: seconds held, for counting hits in half-second ticks. */
  held: number;
}

const NO_INPUT: Vec = { x: 0, y: 0 };

/** Everything the player controls in one frame (from the input layer). */
export interface PilotInput {
  scheme: ControlScheme;
  move: Vec;
  aimTarget: Vec | null;
  fire1: boolean;
  fire2: boolean;
  equip1: boolean;
  equip2: boolean;
  /** Target seeking missiles will home on (null = fire unguided). */
  lock: Unit | null;
}

/** Runtime state of activated equipment. */
export interface EquipmentState {
  /** Shield: seconds left up, damage it can still absorb, seconds until usable again. */
  shieldUp: number;
  shieldPool: number;
  shieldCooldown: number;
  flares: number;
  flareCooldown: number;
  pdCooldown: number;
}

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
  /** Derived from the loadout: heat, armor max, ammo capacity, equipment. */
  readonly loadout: MechStats;
  /** Hangar id of the mech this is. */
  readonly id: number;
  readonly equipmentIds: string[];
  equip: EquipmentState;
  private prevEquip = [false, false];
  private shieldImg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, state: MechState, movement: ChassisMovement, x: number, y: number, angle: number) {
    this.chassis = CHASSIS[state.chassis];
    this.id = state.id;
    this.radius = this.chassis.radius;
    this.equipmentIds = [...state.equipment];
    this.loadout = mechStats(state);
    this.sections = new SectionDamage(this.loadout.sections);
    // Carry damage over from earlier missions (unrepaired sections).
    this.sections.hp = { ...state.sections };
    this.ammo = { ...state.ammo };
    this.motor = new MechMotor(movement, this.radius, x, y, angle);
    this.motor.crushTonnage = this.chassis.tonnage;
    // Art is drawn for a 30-radius (medium) mech; other chassis scale it.
    this.view = new MechView(scene, this.motor, true, this.radius / 30);
    this.weapons = state.weapons.map((w) => ({
      def: WEAPONS[w.weapon],
      mount: this.chassis.mounts.find((m) => m.id === w.mount)!,
      group: w.group,
      cooldown: 0,
      destroyed: false,
      spin: 0,
      held: 0,
    }));
    for (const side of ['leftArm', 'rightArm'] as const) {
      if (this.sections.destroyed(side)) {
        for (const w of this.weapons) if (w.mount.section === side) w.destroyed = true;
        this.view.setArm(side, false);
      }
    }
    this.updateLegs();
    this.equip = {
      shieldUp: 0,
      shieldPool: 0,
      shieldCooldown: 0,
      flares: this.loadout.flares?.charges ?? 0,
      flareCooldown: 0,
      pdCooldown: 0,
    };
    this.shieldImg = scene.add.image(x, y, 'shield-bubble').setScale(this.radius / 30 / 2).setDepth(9).setVisible(false);
  }

  /** The mech's state to carry back to the career after the mission. */
  toState(): MechState {
    return {
      id: this.id,
      chassis: this.chassis.id,
      weapons: this.weapons.map((w) => ({ mount: w.mount.id, weapon: w.def.id, group: w.group })),
      equipment: [...this.equipmentIds],
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

  update(dt: number, input: PilotInput, world: CollisionWorld, bodies: readonly Circle[], combat: Combat): boolean {
    if (!this.alive) return false;
    const L = this.loadout;

    // Heat: the reactor always adds some; the chassis and heat sinks shed it (faster while shut down).
    const cooling = L.dissipation * (this.shutdown > 0 ? HEAT_RULES.shutdownCoolingMultiplier : 1);
    this.heat = Math.max(0, this.heat + (L.passiveHeat - cooling) * dt);
    if (this.shutdown > 0) {
      this.shutdown = Math.max(0, this.shutdown - dt);
      if (this.shutdown === 0) this.view.setAlpha(1);
    }
    const running = this.shutdown === 0;

    const stepped = this.motor.update(
      dt,
      input.scheme,
      running ? input.move : NO_INPUT,
      running ? input.aimTarget : null,
      world,
      bodies,
      this,
    );

    for (const w of this.weapons) {
      w.cooldown = Math.max(0, w.cooldown - dt);
      const held = (w.group === 1 ? input.fire1 : input.fire2) && running && !w.destroyed;
      if (w.def.spinUp) w.spin = Math.max(0, Math.min(1, w.spin + (held ? dt : -dt * 1.5) / w.def.spinUp));
      if (w.def.delivery === 'stream') {
        if (!held) {
          w.held = 0;
          continue;
        }
        // A tick every half second held counts as a shot (and a hit, if it lands).
        const tick = Math.floor((w.held + dt) / 0.5) > Math.floor(w.held / 0.5) || w.held === 0;
        w.held += dt;
        if (tick) this.stats.shots++;
        const { x, y } = this.muzzle(w);
        combat.stream(x, y, this.motor.torsoAngle, w.def, 'player', dt, 1, tick);
        this.heat += w.def.heat * dt;
        continue;
      }
      if (!held || w.cooldown > 0) continue;
      const pool = w.def.family === 'missile' ? 'missile' : 'ballistic';
      if (w.def.ammoPerShot > 0 && this.ammo[pool] < w.def.ammoPerShot) continue;
      this.fireWeapon(w, combat, input.lock);
      if (w.def.ammoPerShot > 0) {
        this.ammo[pool] -= w.def.ammoPerShot;
        this.stats.ammoUsed += w.def.ammoPerShot;
      }
      this.heat += w.def.heat;
      this.stats.shots++;
      // Spin-up weapons start at a quarter of their full rate.
      w.cooldown = 1 / (w.def.fireRate * (w.def.spinUp ? 0.25 + 0.75 * w.spin : 1));
    }

    this.updateEquipment(dt, input, running, combat);

    if (running && this.heat >= L.heatCapacity) {
      this.shutdown = HEAT_RULES.shutdownTime;
      this.view.setAlpha(0.55);
    }

    this.view.update(dt);
    this.shieldImg.setPosition(this.x, this.y).setVisible(this.equip.shieldUp > 0);
    return stepped;
  }

  /** Equipment actions (on press) and point defense (automatic). */
  private updateEquipment(dt: number, input: PilotInput, running: boolean, combat: Combat): void {
    const e = this.equip;
    const L = this.loadout;
    e.shieldCooldown = Math.max(0, e.shieldCooldown - dt);
    e.flareCooldown = Math.max(0, e.flareCooldown - dt);
    if (e.shieldUp > 0) {
      e.shieldUp = Math.max(0, e.shieldUp - dt);
      this.heat += (L.shield?.heatPerSecond ?? 0) * dt;
      if (e.shieldUp === 0 || e.shieldPool <= 0) e.shieldUp = 0;
    }
    const pressed = [input.equip1 && !this.prevEquip[0], input.equip2 && !this.prevEquip[1]];
    this.prevEquip[0] = input.equip1;
    this.prevEquip[1] = input.equip2;
    L.actions.forEach((kind, i) => {
      if (!pressed[i] || !running) return;
      if (kind === 'flares' && L.flares && e.flares > 0 && e.flareCooldown === 0) {
        e.flares--;
        e.flareCooldown = L.flares.cooldown;
        combat.missiles.breakLocks(this, this.x, this.y);
        combat.flareEffect(this.x, this.y);
        play('flare', 1);
      } else if (kind === 'shield' && L.shield && e.shieldCooldown === 0) {
        e.shieldUp = L.shield.duration;
        e.shieldPool = L.shield.capacity;
        e.shieldCooldown = L.shield.cooldown;
        play('shield', 1);
      }
    });

    // Point defense: shoots the nearest incoming missile on its own (needs power, so not while shut down).
    const pd = L.pointDefense;
    if (pd && running) {
      e.pdCooldown = Math.max(0, e.pdCooldown - dt);
      if (e.pdCooldown === 0) {
        const m = combat.missiles.nearestHostile(this.x, this.y, pd.range, 'player');
        if (m) {
          combat.pointDefenseShot(this.x, this.y, m, pd.damage, pd.accuracy);
          e.pdCooldown = 1 / pd.fireRate;
        }
      }
    }
  }

  /** Damage the shield soaks up before armor; returns what gets through. */
  private shieldAbsorb(amount: number): number {
    const e = this.equip;
    if (e.shieldUp <= 0 || e.shieldPool <= 0) return amount;
    const soaked = Math.min(e.shieldPool, amount);
    e.shieldPool -= soaked;
    if (e.shieldPool <= 0) e.shieldUp = 0;
    return amount - soaked;
  }

  /** Fraction 0..1 of the way to overheating. */
  get heatFraction(): number {
    return Math.min(1, this.heat / this.loadout.heatCapacity);
  }

  takeDamage(amount: number, fromX: number, fromY: number, hitX?: number, hitY?: number): void {
    if (!this.alive) return;
    const worldAngle = Math.atan2(fromY - this.y, fromX - this.x);
    this.lastHit = performance.now();
    this.lastHitAngle = worldAngle;
    if (this.invulnerable) return;
    amount = this.shieldAbsorb(amount);
    if (amount <= 0) return;
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
    amount = this.shieldAbsorb(amount);
    if (amount <= 0) return;
    const before = this.sections.total;
    const hit = this.sections.applySplash(amount);
    this.stats.damageTaken += before - this.sections.total;
    for (const s of hit.destroyed) this.loseSection(s);
    this.updateLegs();
  }

  /** Swap station: the mech is flown home intact; it leaves the battlefield. */
  airlift(): void {
    this.view.setVisible(false);
    this.shieldImg.setVisible(false);
    this.equip.shieldUp = 0;
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
    this.ammo = { ...this.loadout.ammoCapacity };
    this.equip.flares = this.loadout.flares?.charges ?? 0;
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

  /** World position of a weapon's muzzle (its hardpoint, turned with the torso). */
  private muzzle(w: MountedWeapon): Vec {
    const m = this.motor;
    const ca = Math.cos(m.torsoAngle);
    const sa = Math.sin(m.torsoAngle);
    return { x: m.pos.x + w.mount.x * ca - w.mount.y * sa, y: m.pos.y + w.mount.x * sa + w.mount.y * ca };
  }

  private fireWeapon(w: MountedWeapon, combat: Combat, lock: Unit | null): void {
    const { x, y } = this.muzzle(w);
    combat.fire(x, y, this.motor.torsoAngle, w.def, 'player', 1, 1, 0, lock);
  }
}
