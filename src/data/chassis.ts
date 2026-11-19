/**
 * Chassis definitions. Movement numbers are what make a mech feel heavy or
 * nimble; tune them here (or live with the ?debug tuning panel, then paste
 * the copied values back in).
 *
 * Units: distance in world units (a mech is ~60 across), time in seconds,
 * angles in degrees (converted to radians in code).
 */
export interface ChassisMovement {
  /** Top forward speed, units/s. */
  maxSpeed: number;
  /** Reverse top speed as a fraction of maxSpeed. */
  reverseFactor: number;
  /** How fast speed builds up, units/s². */
  accel: number;
  /** How fast speed bleeds off when easing off the throttle, units/s². */
  decel: number;
  /** Top leg (hull) turn rate, degrees/s. */
  legTurnRate: number;
  /** How fast leg turning ramps up and down, degrees/s². Lower = more ponderous. */
  legTurnAccel: number;
  /** Torso turn rate toward the aim point, degrees/s. */
  torsoTurnRate: number;
  /** Distance covered per footstep, units. */
  strideLength: number;
  /** Camera shake per footstep (0 = off). Fraction of the screen. */
  stepShake: number;
}

export type HardpointType = 'ballistic' | 'energy' | 'missile';
export type Section = 'torso' | 'leftArm' | 'rightArm' | 'legs';

/** A weapon hardpoint. Position is in torso space (facing +x, +y = right side), world units. */
export interface MountDef {
  id: string;
  section: Section;
  type: HardpointType;
  x: number;
  y: number;
}

export interface ChassisDef {
  id: string;
  name: string;
  weightClass: 'light' | 'medium' | 'heavy' | 'assault';
  tonnage: number;
  /** Collision radius, units. */
  radius: number;
  /** Purchase price (also the basis for rebuild cost). */
  price: number;
  /** Most the mech can weigh with weapons and equipment, tons. */
  maxTonnage: number;
  /** Weight of the chassis itself (structure and base armor), tons. */
  baseTonnage: number;
  /** Internal slots for equipment (the reactor goes here too). */
  internalSlots: number;
  movement: ChassisMovement;
  /** Armor per section. The mech is destroyed when the torso reaches 0. */
  sections: Record<Section, number>;
  /** Heat at which the mech shuts down. */
  heatCapacity: number;
  /** Heat shed per second by the chassis itself (heat sinks add to this). */
  heatDissipation: number;
  /** Ammo pool capacity before ammo bins. */
  ammoCapacity: { ballistic: number; missile: number };
  mounts: MountDef[];
  /**
   * What the pilot can see (fog of war): a cone in front of the torso
   * (`coneDeg` is the half-angle) out to `range`, plus everything within
   * `radius` all around. Sensors add to this.
   */
  vision: { coneDeg: number; range: number; radius: number };
  /** What comes installed when you buy one (included in the price). */
  stock: {
    weapons: { mount: string; weapon: string; group: 1 | 2 }[];
    equipment: string[];
  };
}

export const CHASSIS: Record<string, ChassisDef> = {
  vulture: {
    id: 'vulture',
    name: 'Vulture',
    weightClass: 'medium',
    tonnage: 50,
    radius: 30,
    price: 400000,
    maxTonnage: 50,
    baseTonnage: 30,
    internalSlots: 8,
    movement: {
      maxSpeed: 150,
      reverseFactor: 0.55,
      accel: 85,
      decel: 120,
      legTurnRate: 80,
      legTurnAccel: 240,
      torsoTurnRate: 90,
      strideLength: 46,
      stepShake: 0.0012,
    },
    sections: { torso: 380, leftArm: 150, rightArm: 150, legs: 180 },
    heatCapacity: 100,
    heatDissipation: 6,
    ammoCapacity: { ballistic: 1350, missile: 24 },
    mounts: [
      { id: 'la-b', section: 'leftArm', type: 'ballistic', x: 30, y: -21 },
      { id: 'la-e', section: 'leftArm', type: 'energy', x: 24, y: -27 },
      { id: 'ra-b', section: 'rightArm', type: 'ballistic', x: 30, y: 21 },
      { id: 'ra-e', section: 'rightArm', type: 'energy', x: 24, y: 27 },
      { id: 't-m', section: 'torso', type: 'missile', x: 4, y: -10 },
    ],
    vision: { coneDeg: 42, range: 620, radius: 160 },
    stock: {
      weapons: [
        { mount: 'la-b', weapon: 'autocannon', group: 1 },
        { mount: 'ra-b', weapon: 'machineGun', group: 1 },
        { mount: 'ra-e', weapon: 'laser', group: 2 },
      ],
      equipment: ['standardReactor', 'heatSink'],
    },
  },

  kestrel: {
    id: 'kestrel',
    name: 'Kestrel',
    weightClass: 'light',
    tonnage: 30,
    radius: 24,
    price: 230000,
    maxTonnage: 30,
    baseTonnage: 16,
    internalSlots: 6,
    movement: {
      maxSpeed: 215,
      reverseFactor: 0.6,
      accel: 150,
      decel: 190,
      legTurnRate: 130,
      legTurnAccel: 520,
      torsoTurnRate: 150,
      strideLength: 36,
      stepShake: 0.0005,
    },
    sections: { torso: 230, leftArm: 90, rightArm: 90, legs: 120 },
    heatCapacity: 80,
    heatDissipation: 5,
    ammoCapacity: { ballistic: 900, missile: 0 },
    mounts: [
      { id: 'la-e', section: 'leftArm', type: 'energy', x: 22, y: -18 },
      { id: 'ra-b', section: 'rightArm', type: 'ballistic', x: 24, y: 17 },
      { id: 'ra-e', section: 'rightArm', type: 'energy', x: 19, y: 22 },
    ],
    vision: { coneDeg: 50, range: 680, radius: 190 },
    stock: {
      weapons: [
        { mount: 'la-e', weapon: 'smallLaser', group: 2 },
        { mount: 'ra-e', weapon: 'smallLaser', group: 2 },
        { mount: 'ra-b', weapon: 'machineGun', group: 1 },
      ],
      equipment: ['lightReactor', 'heatSink'],
    },
  },

  condor: {
    id: 'condor',
    name: 'Condor',
    weightClass: 'heavy',
    tonnage: 70,
    radius: 36,
    price: 640000,
    maxTonnage: 70,
    baseTonnage: 41,
    internalSlots: 10,
    movement: {
      maxSpeed: 118,
      reverseFactor: 0.5,
      accel: 60,
      decel: 85,
      legTurnRate: 60,
      legTurnAccel: 150,
      torsoTurnRate: 70,
      strideLength: 54,
      stepShake: 0.002,
    },
    sections: { torso: 520, leftArm: 210, rightArm: 210, legs: 260 },
    heatCapacity: 120,
    heatDissipation: 7,
    ammoCapacity: { ballistic: 1800, missile: 36 },
    mounts: [
      { id: 'la-b', section: 'leftArm', type: 'ballistic', x: 36, y: -25 },
      { id: 'la-e', section: 'leftArm', type: 'energy', x: 29, y: -32 },
      { id: 'ra-b', section: 'rightArm', type: 'ballistic', x: 36, y: 25 },
      { id: 'ra-e', section: 'rightArm', type: 'energy', x: 29, y: 32 },
      { id: 't-m', section: 'torso', type: 'missile', x: 5, y: -12 },
      { id: 't-m2', section: 'torso', type: 'missile', x: 5, y: 12 },
    ],
    vision: { coneDeg: 38, range: 600, radius: 150 },
    stock: {
      weapons: [
        { mount: 'la-b', weapon: 'autocannon', group: 1 },
        { mount: 'ra-b', weapon: 'autocannon', group: 1 },
        { mount: 'ra-e', weapon: 'laser', group: 2 },
        { mount: 't-m', weapon: 'missilePack', group: 2 },
      ],
      equipment: ['standardReactor', 'heatSink'],
    },
  },

  roc: {
    id: 'roc',
    name: 'Roc',
    weightClass: 'assault',
    tonnage: 90,
    radius: 42,
    price: 960000,
    maxTonnage: 90,
    baseTonnage: 54,
    internalSlots: 12,
    movement: {
      maxSpeed: 92,
      reverseFactor: 0.45,
      accel: 45,
      decel: 65,
      legTurnRate: 45,
      legTurnAccel: 110,
      torsoTurnRate: 55,
      strideLength: 62,
      stepShake: 0.003,
    },
    sections: { torso: 700, leftArm: 280, rightArm: 280, legs: 340 },
    heatCapacity: 140,
    heatDissipation: 8,
    ammoCapacity: { ballistic: 2250, missile: 48 },
    mounts: [
      { id: 'la-b', section: 'leftArm', type: 'ballistic', x: 42, y: -29 },
      { id: 'la-b2', section: 'leftArm', type: 'ballistic', x: 38, y: -36 },
      { id: 'la-e', section: 'leftArm', type: 'energy', x: 33, y: -40 },
      { id: 'ra-b', section: 'rightArm', type: 'ballistic', x: 42, y: 29 },
      { id: 'ra-e', section: 'rightArm', type: 'energy', x: 38, y: 36 },
      { id: 'ra-e2', section: 'rightArm', type: 'energy', x: 33, y: 40 },
      { id: 't-m', section: 'torso', type: 'missile', x: 6, y: -14 },
      { id: 't-m2', section: 'torso', type: 'missile', x: 6, y: 14 },
    ],
    vision: { coneDeg: 35, range: 580, radius: 140 },
    stock: {
      weapons: [
        { mount: 'la-b', weapon: 'autocannon', group: 1 },
        { mount: 'ra-b', weapon: 'autocannon', group: 1 },
        { mount: 'la-e', weapon: 'laser', group: 2 },
        { mount: 'ra-e', weapon: 'laser', group: 2 },
        { mount: 't-m', weapon: 'missilePack', group: 2 },
      ],
      equipment: ['heavyReactor', 'heatSink', 'heatSink'],
    },
  },
};

/** Chassis the shop sells, in display order. */
export const CHASSIS_ORDER = ['kestrel', 'vulture', 'condor', 'roc'];

export const STARTER_CHASSIS = 'vulture';
