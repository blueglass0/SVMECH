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
      torsoTurnRate: 120,
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
    vision: { coneDeg: 55, range: 620, radius: 210 },
  },
};

export const STARTER_CHASSIS = 'vulture';
