/**
 * Locational damage rules for mechs (player now, enemy mechs from milestone 8).
 * Tanks, turrets and structures have a single HP bar instead.
 *
 * Which section a shot hits depends on where it comes from relative to the
 * torso facing: front -> torso, either side -> that arm, behind -> torso,
 * with extra damage (thinner rear armor). Legs take a share of every hit.
 */
export const DAMAGE_RULES = {
  /** Half-angle of the front arc, degrees. Shots inside it hit the torso. */
  frontDeg: 50,
  /** Half-angle of the rear arc, degrees (measured from straight behind). */
  rearDeg: 40,
  /** Damage multiplier for hits from behind. */
  rearMultiplier: 1.5,
  /** Fraction of every hit that goes to the legs instead. */
  legShare: 0.15,
  /** Leg damage only slows the mech once the legs drop below this fraction... */
  legPenaltyStart: 0.6,
  /** ...down to these multipliers when the legs are destroyed. */
  legSpeedMin: 0.35,
  legTurnMin: 0.55,
  /** Sections below this fraction smoke. */
  smokeBelow: 0.4,
};
