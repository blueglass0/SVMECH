/**
 * Every economy number: prices, payouts, upkeep, loans. Multiplied by the
 * economy difficulty chosen when a career starts. Money is in credits (¢).
 */
export const ECONOMY = {
  startingMoney: 80000,
  /** Fuel per deployment, per ton of mech. */
  fuelPerTon: 120,
  /** Price per ammo unit loaded. */
  ammoPrice: { ballistic: 8, missile: 25 },
  /** Repair price per armor point. */
  repairPerArmor: 55,
  /** Repairing a destroyed section costs this much more (rebuilding it and its weapons). */
  destroyedSectionMultiplier: 1.5,
  /** Rebuilding a destroyed mech costs this fraction of its value (chassis + installed weapons). */
  rebuildFraction: 0.35,
  /** Gear sells for this fraction of its price. */
  sellFraction: 0.6,
  /** Contracts offered at once. */
  contractsOnBoard: 4,
  /** Bonus objective pays this fraction of the base payout. */
  bonusFraction: 0.25,
  /** Backup mechs the ship carries: one extra chance per mission (user decision after M7). */
  maxBackups: 1,
  /** Backups cost this fraction of their normal fuel (they ride along). */
  backupFuelFraction: 0.3,
  /** Chance a contract has a tonnage limit, the limits used, and the extra pay for one. */
  tonnageLimitChance: 0.35,
  tonnageLimits: [40, 55, 75],
  tonnageLimitPayBonus: 0.15,
  /** Each enemy mech on a contract adds this share to the payout (milestone 8). */
  enemyMechPayBonus: 0.12,
  /** Field stations (ammo depot, repair bay, swap station) on some maps. */
  field: {
    /** Field services cost this many times the hangar price: repairs and ammo separately. */
    repairMarkup: 2,
    ammoMarkup: 3,
    /** Paying the cargo crew to swap your mech for the backup. */
    swapFee: 16000,
    /** How many stations a map gets, and the chance each one is a swap station. */
    stationsPerMap: [1, 2] as [number, number],
    swapChance: 0.35,
  },
  tiers: {
    1: { name: 'Low risk', payout: [55000, 75000], targets: 2, enemyCount: 0.7 },
    2: { name: 'Standard', payout: [90000, 120000], targets: 3, enemyCount: 1 },
    3: { name: 'High risk', payout: [140000, 180000], targets: 4, enemyCount: 1.35 },
  } as Record<1 | 2 | 3, { name: string; payout: [number, number]; targets: number; enemyCount: number }>,
  /** Chance of each tier appearing on the board. */
  tierWeights: { 1: 0.4, 2: 0.4, 3: 0.2 } as Record<1 | 2 | 3, number>,
  loan: {
    /** Loan sizes offered. One loan at a time. */
    amounts: [100000, 200000, 300000],
    /** Total interest as a fraction of the principal. */
    interest: 0.2,
    /** Repaid in this many equal installments, one after each mission. */
    installments: 5,
  },
};

export interface EconomyDifficulty {
  /** Multiplies every cost: fuel, ammo, repairs, rebuilds, shop prices. */
  costs: number;
  /** Multiplies contract payouts. */
  payouts: number;
  /** Multiplies loan interest. */
  interest: number;
  /** If false, going bankrupt gives an emergency bailout instead of ending the career. */
  bankruptcyEndsCareer: boolean;
}

export const ECONOMY_DIFFICULTY: Record<'easy' | 'normal' | 'hard', EconomyDifficulty> = {
  easy: { costs: 0.75, payouts: 1.2, interest: 0.5, bankruptcyEndsCareer: false },
  normal: { costs: 1, payouts: 1, interest: 1, bankruptcyEndsCareer: true },
  hard: { costs: 1.25, payouts: 0.85, interest: 1.5, bankruptcyEndsCareer: true },
};

/** Everything the shop lists, in display order. Who sells what, and at what reputation: data/factions.ts. */
export const SHOP_STOCK = [
  // Weapons
  'machineGun',
  'autocannon',
  'smallLaser',
  'laser',
  'gatling',
  'heavyCannon',
  'pulseLaser',
  'largeLaser',
  'beamLaser',
  'heavyBeamLaser',
  'plasma',
  'lightning',
  'rocketPod',
  'missilePack',
  'missileRack',
  // Equipment
  'lightReactor',
  'standardReactor',
  'heavyReactor',
  'assaultReactor',
  'heatSink',
  'doubleHeatSink',
  'armorPlating',
  'ammoBin',
  'missileBin',
  'shieldGenerator',
  'flareLauncher',
  'pointDefense',
  'sensorSuite',
  'radarArray',
];

/** Contract flavour. Employer and enemy names come from the factions (data/factions.ts). */
export const HUNT_FLAVOR = [
  'The {enemy} pilot "{ace}" has been bleeding {employer} for months. Find that mech and put it down.',
  '{employer} has a price on "{ace}", the {enemy} ace. Intel will ping its position when they can.',
  'Kill "{ace}". {employer} wants proof the {enemy} lost their best pilot.',
];

export const RAID_FLAVOR = [
  'The {enemy} are moving a supply convoy across the sector. {employer} wants it stopped before it reaches the front.',
  '{employer} pays for every {enemy} truck that never arrives. The convoy is already moving.',
  'The {enemy} are running fuel and parts through this valley. Break the convoy for {employer}.',
];

export const DEFEND_FLAVOR = [
  'The {enemy} are massing to hit a {employer} power station. Hold it until reinforcements arrive.',
  '{employer} needs its generators kept running through a {enemy} assault. Waves are inbound.',
  'Intercepted {enemy} orders point at a {employer} outpost. Dig in and keep the generators alive.',
];

export const ESCORT_FLAVOR = [
  '{employer} is moving a convoy through {enemy} territory. Stay with the trucks and get them across.',
  'The {enemy} have set ambushes along the only road out. {employer} needs its convoy through.',
  'Escort a {employer} supply run past {enemy} positions. The drivers won\'t move without you close by.',
];

export const CONTRACT_FLAVOR = [
  'The {enemy} have been coordinating raids through a string of uplink towers. {employer} wants them gone.',
  '{employer} needs the {enemy} relay network silenced before their convoy moves through.',
  'A {enemy} uplink grid is jamming {employer} traffic across the sector. Cut it.',
  'The {enemy} are using uplink towers to spot for artillery. {employer} pays for every one destroyed.',
];
