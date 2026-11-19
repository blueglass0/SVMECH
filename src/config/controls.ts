/** Input and camera feel. Sizes in CSS pixels unless noted. */
export const CONTROLS = {
  /** Virtual stick radius (how far the knob travels). */
  stickRadius: 58,
  /** Stick input below this fraction is ignored. */
  stickDeadZone: 0.15,
  /** Right stick centre: distance from the bottom-right corner. */
  rightStickInset: { x: 135, y: 122 },
  /** A touch this many radii from the right stick centre grabs it. */
  rightStickGrab: 1.7,
  /** Left stick spawns wherever the thumb lands in the left part of the screen. */
  leftZoneWidth: 0.5,
  /** Inactive left stick is shown here as a hint (from the bottom-left corner). */
  leftStickHome: { x: 135, y: 122 },
  /** Fire group 2 button: offset from the right stick centre, and radius. */
  fire2Offset: { x: -98, y: -62 },
  buttonRadius: 40,
  /** A floating stick's base never spawns closer than this to the screen edge (beyond its radius). */
  stickEdgeMargin: 26,
} as const;

export const CAMERA = {
  /** How quickly the camera catches up, per second. Higher = tighter. */
  followRate: 5,
  /** Camera shifts toward the aim point by this fraction of the distance (mouse)... */
  leadFraction: 0.25,
  /** ...up to this many world units. Also the lead for stick aiming. */
  leadMax: 180,
  /** World units from the mech to the torso aim marker. */
  aimMarkerDistance: 120,
} as const;
