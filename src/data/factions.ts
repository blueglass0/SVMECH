/**
 * The three factions (milestone 9): who hires you, who you fight, what they
 * sell, and how their armies fight. Reputation runs from -100 to 100.
 */
export type FactionId = 'royalists' | 'technocrats' | 'freestars';

export const FACTION_ORDER: FactionId[] = ['royalists', 'technocrats', 'freestars'];

export interface ShopEntry {
  /** Weapon, equipment or chassis id. */
  item: string;
  /** Reputation needed to buy it. */
  rep: number;
}

export interface ArmyStyle {
  /** Multiplies turrets, tanks and roaming tanks (on top of difficulty and tier). */
  enemyCount: number;
  tankTypes: { type: string; weight: number }[];
  turretTypes: string[];
  /** Enemy mech types by contract tier, picked by weight. */
  mechTypes: Record<1 | 2 | 3, { type: string; weight: number }[]>;
  /** Added to the tier's enemy mech and drone flight counts (min 0). */
  extraMechs: number;
  extraDroneFlights: number;
  /** Texture suffix for this army's tanks, turrets, drones and mechs (colour). */
  skin: string;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  /** Colour for the UI (CSS) and for their units (art palette). */
  css: string;
  blurb: string;
  /** How they fight, shown in the Factions tab. */
  fights: string;
  /** What their shop specialises in, shown in the Factions tab. */
  sells: string;
  /** Outfits that hire you on their behalf, and the forces you meet when fighting them. */
  employers: string[];
  forces: string[];
  /** Items only this faction sells, and the reputation each needs. */
  shop: ShopEntry[];
  /** Discount on open-market gear at this reputation or above (Freestars' cheap weathered gear). */
  discounts?: { rep: number; fraction: number }[];
  army: ArmyStyle;
}

export const REPUTATION = {
  min: -100,
  max: 100,
  /** Won contract: the employer's opinion of you rises, by tier. */
  win: { 1: 6, 2: 9, 3: 13 } as Record<1 | 2 | 3, number>,
  /** The faction you fought (won or lost) thinks less of you, by tier. */
  fought: { 1: -4, 2: -6, 3: -9 } as Record<1 | 2 | 3, number>,
  /** Failing or walking out on a contract. */
  failed: -3,
  /** At or below this they won't hire you or sell to you. */
  hostileAt: -30,
  levels: [
    { min: -100, name: 'Hostile' },
    { min: -29, name: 'Neutral' },
    { min: 20, name: 'Friendly' },
    { min: 50, name: 'Trusted' },
    { min: 80, name: 'Allied' },
  ],
};

export const FACTIONS: Record<FactionId, FactionDef> = {
  royalists: {
    id: 'royalists',
    name: 'Royalists',
    css: '#e0574a',
    blurb: 'Stern authoritarians descended from ancient Earth governments.',
    fights: 'Big numbers, heavy mechs, cannons everywhere.',
    sells: 'Cannon platforms, missile racks and heavy reactors.',
    employers: ['Crown Logistics Office', 'Royal Colonial Guard', 'House Varran Treasury', 'Ministry of the Frontier'],
    forces: ['Royal Guard', 'Crown Garrison', 'House Varran Lancers', 'Royal Armoured Brigade'],
    shop: [
      { item: 'heavyReactor', rep: 10 },
      { item: 'heavyCannon', rep: 20 },
      { item: 'missileRack', rep: 35 },
      { item: 'bastion', rep: 45 },
    ],
    army: {
      enemyCount: 1.25,
      tankTypes: [
        { type: 'lightTank', weight: 3 },
        { type: 'heavyTank', weight: 2 },
        { type: 'missileTank', weight: 1 },
      ],
      turretTypes: ['cannonTurret', 'cannonTurret', 'gunTurret'],
      mechTypes: {
        1: [{ type: 'guardsman', weight: 1 }],
        2: [
          { type: 'guardsman', weight: 2 },
          { type: 'brawler', weight: 2 },
        ],
        3: [
          { type: 'brawler', weight: 2 },
          { type: 'castellan', weight: 2 },
          { type: 'juggernaut', weight: 1 },
        ],
      },
      extraMechs: 0,
      extraDroneFlights: -1,
      skin: '-royal',
    },
  },
  technocrats: {
    id: 'technocrats',
    name: 'Technocrats',
    css: '#4f9dff',
    blurb: 'Cybernetic transhumanists, the most advanced faction.',
    fights: 'Energy weapons and advanced parts, smaller forces.',
    sells: 'Specialised energy weapons, the Seraph energy frame, sensors, shields and reactors.',
    employers: ['Lumen Collective', 'Axiom Research Directorate', 'The Continuity Institute', 'Helix Synthesis Lab'],
    forces: ['Axiom Security', 'Lumen Wardens', 'Continuity Enforcers', 'Helix Guard'],
    shop: [
      { item: 'sensorSuite', rep: 0 },
      { item: 'doubleHeatSink', rep: 10 },
      { item: 'shieldGenerator', rep: 15 },
      { item: 'plasma', rep: 25 },
      { item: 'seraph', rep: 30 },
      { item: 'radarArray', rep: 30 },
      { item: 'heavyBeamLaser', rep: 40 },
      { item: 'assaultReactor', rep: 50 },
    ],
    army: {
      enemyCount: 0.75,
      tankTypes: [
        { type: 'laserTank', weight: 3 },
        { type: 'missileTank', weight: 1 },
      ],
      turretTypes: ['laserTurret', 'gunTurret'],
      mechTypes: {
        1: [{ type: 'lancer', weight: 1 }],
        2: [
          { type: 'lancer', weight: 3 },
          { type: 'arbiter', weight: 1 },
        ],
        3: [
          { type: 'arbiter', weight: 2 },
          { type: 'warden', weight: 2 },
        ],
      },
      extraMechs: 0,
      extraDroneFlights: 0,
      skin: '-tech',
    },
  },
  freestars: {
    id: 'freestars',
    name: 'Freestars',
    css: '#b08a5a',
    blurb: 'Ragtag rebels and outcasts on the edge of anarchy.',
    fights: 'Light mechs, machine guns, drones and guerrilla tactics.',
    sells: 'Fast light mechs, lightning guns and cheap weathered gear.',
    employers: ['Free Haven Council', 'The Dust Runners', 'Kessel Row Cooperative', 'Open Sky Caravan'],
    forces: ['Dust Runner Cells', 'Free Haven Militia', 'Ashfall Raiders', 'Red Ridge Separatists'],
    shop: [
      { item: 'jackal', rep: 5 },
      { item: 'pointDefense', rep: 10 },
      { item: 'shrike', rep: 20 },
      { item: 'lightning', rep: 25 },
    ],
    discounts: [
      { rep: 20, fraction: 0.1 },
      { rep: 50, fraction: 0.2 },
    ],
    army: {
      enemyCount: 1,
      tankTypes: [
        { type: 'technical', weight: 4 },
        { type: 'missileTank', weight: 1 },
      ],
      turretTypes: ['gunTurret'],
      mechTypes: {
        1: [
          { type: 'raider', weight: 1 },
          { type: 'harrier', weight: 1 },
        ],
        2: [
          { type: 'raider', weight: 1 },
          { type: 'harrier', weight: 2 },
          { type: 'skirmisher', weight: 1 },
        ],
        3: [
          { type: 'harrier', weight: 2 },
          { type: 'skirmisher', weight: 2 },
          { type: 'raider', weight: 1 },
        ],
      },
      extraMechs: 0,
      extraDroneFlights: 1,
      skin: '-free',
    },
  },
};

/**
 * Open market: sold to everyone regardless of reputation (Freestars friends get it cheaper):
 * a generalist mech in every weight class and the common weapons. Faction gear is the
 * specialised kit (`FactionDef.shop`).
 */
export const OPEN_MARKET = [
  // Mechs: a generalist in every weight class.
  'kestrel',
  'vulture',
  'condor',
  'roc',
  // Weapons
  'machineGun',
  'autocannon',
  'gatling',
  'smallLaser',
  'pulseLaser',
  'laser',
  'beamLaser',
  'largeLaser',
  'rocketPod',
  'missilePack',
  // Equipment
  'lightReactor',
  'standardReactor',
  'heatSink',
  'armorPlating',
  'ammoBin',
  'missileBin',
  'flareLauncher',
];
