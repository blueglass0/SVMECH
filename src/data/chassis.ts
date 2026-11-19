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

export interface ChassisDef {
  id: string;
  name: string;
  weightClass: 'light' | 'medium' | 'heavy' | 'assault';
  tonnage: number;
  /** Collision radius, units. */
  radius: number;
  movement: ChassisMovement;
}

export const CHASSIS: Record<string, ChassisDef> = {
  vulture: {
    id: 'vulture',
    name: 'Vulture',
    weightClass: 'medium',
    tonnage: 50,
    radius: 30,
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
  },
};

export const STARTER_CHASSIS = 'vulture';
