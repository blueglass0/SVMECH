/**
 * Procedural mission templates. Milestone 3 has one: destroy targets.
 * Counts are before the combat difficulty multiplier.
 */
export const DESTROY_TARGETS = {
  name: 'Destroy targets',
  briefing: (n: number) => `Destroy ${n} uplink towers`,
  map: {
    width: 3200,
    height: 3200,
    /** Every gap between obstacles (and the map edge) is at least this wide, so every area is reachable. */
    minGap: 100,
    towns: [3, 4],
    rockFields: [6, 9],
    walls: [10, 16],
    scatter: [35, 50],
  },
  targets: 3,
  target: 'uplink',
  /** Turret types picked in turn around each target. */
  turretsPerTarget: 2,
  turretTypes: ['gunTurret', 'cannonTurret'],
  /** Tanks guarding each target, plus some roaming the map. */
  tanksPerTarget: 1,
  roamingTanks: [3, 4],
  tankType: 'lightTank',
  /** Keep this clear around the player's drop point. */
  spawnClearance: 380,
  /** Targets are at least this far from the drop point. */
  targetMinDistance: 1300,
} as const;

export const MISSION_THEME = {
  ground: 0x161b20,
  gridMinor: 0x1f262d,
  gridMajor: 0x2b343d,
  border: 0xe8a33d,
  building: 0x2c353e,
  buildingEdge: 0x47535e,
  rock: 0x332f2a,
  rockEdge: 0x544c42,
  wall: 0x30363a,
  wallEdge: 0x5a636b,
};
