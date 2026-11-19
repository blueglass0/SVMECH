/**
 * Enemy units for the faction-neutral army (milestone 3). Tanks, turrets and
 * structures have one HP bar; enemy mechs (milestone 8) will use the player's
 * systems instead. Distances in world units, time in seconds, angles in degrees.
 */
export interface EnemyDef {
  id: string;
  name: string;
  kind: 'tank' | 'turret' | 'structure';
  hp: number;
  radius: number;
  weapon?: string;
  /** Tanks only. */
  speed?: number;
  accel?: number;
  hullTurnRate?: number;
  turretTurnRate?: number;
  /** Notices the player within this range (needs line of sight). */
  detectRange: number;
  /** Tanks stop and shoot from about this far. */
  preferredRange?: number;
  /** 0 = aims at the player, 1 = leads perfectly. */
  aimLead?: number;
  /** Tanks: crush terrain up to this tonnage by driving into it (see data/terrain.ts). */
  crushTonnage?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  lightTank: {
    id: 'lightTank',
    name: 'Light tank',
    kind: 'tank',
    hp: 130,
    radius: 26,
    weapon: 'tankCannon',
    speed: 115,
    accel: 120,
    hullTurnRate: 90,
    turretTurnRate: 110,
    detectRange: 650,
    preferredRange: 380,
    aimLead: 0.5,
    crushTonnage: 35,
  },
  missileTank: {
    id: 'missileTank',
    name: 'Missile carrier',
    kind: 'tank',
    hp: 110,
    radius: 26,
    weapon: 'enemyMissiles',
    speed: 95,
    accel: 100,
    hullTurnRate: 80,
    turretTurnRate: 90,
    detectRange: 700,
    preferredRange: 520,
    aimLead: 0,
    crushTonnage: 35,
  },
  gunTurret: {
    id: 'gunTurret',
    name: 'Gun turret',
    kind: 'turret',
    hp: 150,
    radius: 24,
    weapon: 'turretGun',
    turretTurnRate: 140,
    detectRange: 480,
    aimLead: 0.3,
  },
  cannonTurret: {
    id: 'cannonTurret',
    name: 'Cannon turret',
    kind: 'turret',
    hp: 220,
    radius: 26,
    weapon: 'turretCannon',
    turretTurnRate: 70,
    detectRange: 620,
    aimLead: 0.6,
  },
  uplink: {
    id: 'uplink',
    name: 'Uplink tower',
    kind: 'structure',
    hp: 380,
    radius: 38,
    detectRange: 0,
  },
};
