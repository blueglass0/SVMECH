import type { Loadout } from './loadouts';

/**
 * Enemy units for the faction-neutral army. Tanks, turrets, drones and
 * structures have one HP bar; enemy mechs (milestone 8) use the player's
 * systems: a chassis, a loadout, locational damage, heat and equipment.
 * Distances in world units, time in seconds, angles in degrees.
 */
export interface EnemyDef {
  id: string;
  name: string;
  kind: 'tank' | 'turret' | 'structure' | 'drone' | 'mech';
  /** Unused for mechs (their armor comes from the chassis). */
  hp: number;
  /** Unused for mechs (the chassis decides). */
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
  /** Drones: circle the player at about this distance. */
  orbitRange?: number;
  /** Enemy mechs: what they field, and how they fight. */
  mech?: EnemyMechDef;
}

export interface EnemyMechDef {
  chassis: string;
  weapons: Loadout['weapons'];
  /** Internal equipment, including the reactor (shield and flares get used, point defense runs itself). */
  equipment: string[];
  /** Multiplies the chassis armor: enemy mechs are lighter-armoured than yours so fights don't drag. */
  armorScale: number;
  /** Multiplies weapon damage (on top of the combat difficulty). */
  damageScale: number;
  /** How far off their aim wanders, degrees either side. */
  aimErrorDeg: number;
  /** 0..1: how hard they circle you once in range (lights dance, assaults plod). */
  strafe: number;
  /** Seconds after spotting you before they open fire. */
  reaction: number;
  /**
   * Body size relative to the player's version of the chassis. Medium and heavy enemy mechs are
   * a little bigger so both arms' guns can land on them (weapons fire straight from their mounts).
   * Keep the diameter under the 100-unit minimum gap between obstacles.
   */
  sizeScale?: number;
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

  // --- Milestone 8: drones and enemy mechs ---
  drone: {
    id: 'drone',
    name: 'Attack drone',
    kind: 'drone',
    hp: 40,
    radius: 14,
    weapon: 'droneGun',
    speed: 190,
    accel: 260,
    turretTurnRate: 240,
    detectRange: 650,
    orbitRange: 260,
    aimLead: 0.4,
  },
  raider: {
    id: 'raider',
    name: 'Raider (Kestrel)',
    kind: 'mech',
    hp: 0,
    radius: 0,
    detectRange: 700,
    preferredRange: 300,
    aimLead: 0.5,
    mech: {
      chassis: 'kestrel',
      weapons: [
        { mount: 'la-e', weapon: 'smallLaser', group: 1 },
        { mount: 'ra-e', weapon: 'smallLaser', group: 1 },
        { mount: 'ra-b', weapon: 'machineGun', group: 2 },
      ],
      equipment: ['lightReactor', 'heatSink'],
      armorScale: 0.5,
      damageScale: 0.4,
      aimErrorDeg: 5,
      strafe: 0.8,
      reaction: 0.7,
    },
  },
  trooper: {
    id: 'trooper',
    name: 'Trooper (Vulture)',
    kind: 'mech',
    hp: 0,
    radius: 0,
    detectRange: 680,
    preferredRange: 400,
    aimLead: 0.5,
    mech: {
      chassis: 'vulture',
      weapons: [
        { mount: 'la-b', weapon: 'autocannon', group: 1 },
        { mount: 'ra-b', weapon: 'machineGun', group: 1 },
        { mount: 'ra-e', weapon: 'laser', group: 2 },
        { mount: 't-m', weapon: 'missilePack', group: 2 },
      ],
      equipment: ['standardReactor', 'heatSink', 'flareLauncher'],
      armorScale: 0.6,
      damageScale: 0.37,
      aimErrorDeg: 4,
      strafe: 0.7,
      sizeScale: 1.1,
      reaction: 0.8,
    },
  },
  brawler: {
    id: 'brawler',
    name: 'Brawler (Condor)',
    kind: 'mech',
    hp: 0,
    radius: 0,
    detectRange: 650,
    preferredRange: 330,
    aimLead: 0.5,
    mech: {
      chassis: 'condor',
      weapons: [
        { mount: 'la-b', weapon: 'gatling', group: 1 },
        { mount: 'ra-b', weapon: 'autocannon', group: 1 },
        { mount: 'ra-e', weapon: 'beamLaser', group: 2 },
        { mount: 't-m', weapon: 'rocketPod', group: 2 },
      ],
      equipment: ['standardReactor', 'heatSink', 'heatSink', 'shieldGenerator'],
      armorScale: 0.7,
      damageScale: 0.33,
      aimErrorDeg: 4,
      strafe: 0.5,
      sizeScale: 1.15,
      reaction: 0.9,
    },
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut (Roc)',
    kind: 'mech',
    hp: 0,
    radius: 0,
    detectRange: 650,
    preferredRange: 450,
    aimLead: 0.6,
    mech: {
      chassis: 'roc',
      weapons: [
        { mount: 'la-b', weapon: 'heavyCannon', group: 1 },
        { mount: 'ra-b', weapon: 'autocannon', group: 1 },
        { mount: 'la-e', weapon: 'largeLaser', group: 2 },
        { mount: 'ra-e', weapon: 'laser', group: 2 },
        { mount: 't-m', weapon: 'missilePack', group: 2 },
      ],
      equipment: ['assaultReactor', 'heatSink', 'heatSink', 'pointDefense'],
      armorScale: 0.8,
      damageScale: 0.36,
      aimErrorDeg: 3.5,
      strafe: 0.3,
      sizeScale: 1.12,
      reaction: 1,
    },
  },
};
