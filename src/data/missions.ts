/**
 * Procedural mission templates. Counts are before the combat difficulty multiplier.
 * The map layout (`DESTROY_TARGETS.map`) is shared by every mission type.
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
    /** Destructible terrain (milestone 6b). */
    barriers: [8, 14],
    forests: [3, 5],
    fences: [5, 9],
    sheds: [10, 18],
    sandbags: [8, 14],
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
  /** Tank types picked at random by weight. */
  tankTypes: [
    { type: 'lightTank', weight: 3 },
    { type: 'missileTank', weight: 1 },
  ],
  /**
   * Drone flights and enemy mechs (milestone 8), per contract tier. Rolled when the
   * contract is made so the board can show them. Counts are [min, max].
   */
  forces: {
    1: { droneFlights: [0, 1], mechs: [0, 1], mechTypes: [{ type: 'raider', weight: 3 }, { type: 'trooper', weight: 1 }] },
    2: { droneFlights: [1, 2], mechs: [1, 1], mechTypes: [{ type: 'raider', weight: 2 }, { type: 'trooper', weight: 3 }, { type: 'brawler', weight: 1 }] },
    3: { droneFlights: [1, 2], mechs: [1, 2], mechTypes: [{ type: 'trooper', weight: 2 }, { type: 'brawler', weight: 3 }, { type: 'juggernaut', weight: 1 }] },
  } as Record<1 | 2 | 3, { droneFlights: [number, number]; mechs: [number, number]; mechTypes: { type: string; weight: number }[] }>,
  /** Drones per flight (not scaled by difficulty: flights already scale with the tier). */
  droneFlightSize: [2, 3],
  droneType: 'drone',
  /** Keep this clear around the player's drop point. */
  spawnClearance: 380,
  /** Targets are at least this far from the drop point. */
  targetMinDistance: 1300,
} as const;

export type MissionType = 'destroy' | 'hunt' | 'raid';
export type MapSize = 'standard' | 'large';

/**
 * Mission types (milestone 10). Each contract rolls one by weight. `payMult` scales the
 * tier's payout; `noun` is what the objective counter counts.
 */
export const MISSION_TYPES: Record<MissionType, { name: string; weight: number; payMult: number; noun: string }> = {
  destroy: { name: 'Destroy targets', weight: 5, payMult: 1, noun: 'uplinks' },
  hunt: { name: 'Mech hunt', weight: 2.5, payMult: 1.15, noun: 'target' },
  raid: { name: 'Convoy raid', weight: 2.5, payMult: 1.1, noun: 'trucks' },
};

/** Map sizes: large maps are 1.375x wider and taller (about 1.9x the area, obstacles scale with it). */
export const MAP_SIZES: Record<MapSize, { scale: number; chance: number; payBonus: number; label: string }> = {
  standard: { scale: 1, chance: 0.65, payBonus: 0, label: 'Standard map' },
  large: { scale: 1.375, chance: 0.35, payBonus: 0.15, label: 'Large map' },
};

/** Mech hunt: a named enemy ace roams between outposts; intel pings its position now and then. */
export const HUNT = {
  outposts: 3,
  /** The ace is tougher, hits harder and aims better than a regular of its type. */
  armorMult: 1.6,
  damageMult: 1.15,
  aimMult: 0.7,
  /** Seconds between intel pings of the ace's position. */
  pingEvery: 20,
  callsigns: ['Grimjaw', 'Widowmaker', 'Saint Ashes', 'Red Iris', 'Hollowpoint', 'Old Thunder', 'Vesper', 'Kingfisher', 'Rust Baron', 'Nightjar'],
};

/** Convoy raid: trucks drive across the map along a road; stop enough of them before they get away. */
export const RAID = {
  trucks: { 1: 4, 2: 5, 3: 6 } as Record<1 | 2 | 3, number>,
  /** Share of the trucks you must destroy (rounded: 4 → 3, 5 → 4, 6 → 4). */
  required: 0.7,
  /** Escort vehicles, by tier (types from the enemy army's tank mix). */
  escorts: { 1: 2, 2: 3, 3: 4 } as Record<1 | 2 | 3, number>,
  /** Turret outposts along the way. */
  outposts: 2,
  truckType: 'truck',
  /** Gap kept between trucks in the column, units. */
  spacing: 90,
  /** Seconds before the convoy sets off. */
  startDelay: 8,
};

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
