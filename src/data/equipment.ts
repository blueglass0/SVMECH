/**
 * Equipment for internal slots: one reactor, plus heat sinks, armor, ammo
 * bins, shield, flares and point defense. Sensors arrive with fog of war.
 * Distances in world units, time in seconds.
 */
export type EquipmentKind = 'reactor' | 'heatSink' | 'armor' | 'ammoBin' | 'shield' | 'flares' | 'pointDefense';

export interface EquipmentDef {
  id: string;
  name: string;
  kind: EquipmentKind;
  slots: number;
  tonnage: number;
  /** Power drawn (reactors supply power instead; see `output`). */
  power: number;
  price: number;
  /** Reactor: power supplied, and heat it gives off all the time. */
  output?: number;
  passiveHeat?: number;
  /** Heat sink: extra heat shed per second. */
  dissipation?: number;
  /** Armor plating: extra armor per section. */
  armor?: { torso: number; leftArm: number; rightArm: number; legs: number };
  /** Ammo bin: extra capacity. */
  ammo?: { ballistic: number; missile: number };
  /** Shield: absorbs up to `capacity` damage for `duration` seconds after activation. */
  shield?: { capacity: number; duration: number; cooldown: number; heat: number };
  /** Flares: break locks of missiles chasing you. */
  flares?: { charges: number; cooldown: number };
  /** Point defense: shoots incoming missiles automatically. */
  pointDefense?: { range: number; fireRate: number; damage: number; accuracy: number };
}

export const EQUIPMENT: Record<string, EquipmentDef> = {
  lightReactor: {
    id: 'lightReactor',
    name: 'Light reactor',
    kind: 'reactor',
    slots: 2,
    tonnage: 4,
    power: 0,
    price: 30000,
    output: 12,
    passiveHeat: 0.5,
  },
  standardReactor: {
    id: 'standardReactor',
    name: 'Standard reactor',
    kind: 'reactor',
    slots: 2,
    tonnage: 6,
    power: 0,
    price: 60000,
    output: 16,
    passiveHeat: 1,
  },
  heavyReactor: {
    id: 'heavyReactor',
    name: 'Heavy reactor',
    kind: 'reactor',
    slots: 3,
    tonnage: 9,
    power: 0,
    price: 110000,
    output: 23,
    passiveHeat: 2.5,
  },
  heatSink: {
    id: 'heatSink',
    name: 'Heat sink',
    kind: 'heatSink',
    slots: 1,
    tonnage: 1,
    power: 0,
    price: 6000,
    dissipation: 2.5,
  },
  doubleHeatSink: {
    id: 'doubleHeatSink',
    name: 'Double heat sink',
    kind: 'heatSink',
    slots: 2,
    tonnage: 1.5,
    power: 0,
    price: 18000,
    dissipation: 5,
  },
  armorPlating: {
    id: 'armorPlating',
    name: 'Armor plating',
    kind: 'armor',
    slots: 1,
    tonnage: 2,
    power: 0,
    price: 9000,
    armor: { torso: 30, leftArm: 12, rightArm: 12, legs: 16 },
  },
  ammoBin: {
    id: 'ammoBin',
    name: 'Ballistic ammo bin',
    kind: 'ammoBin',
    slots: 1,
    tonnage: 1,
    power: 0,
    price: 4000,
    ammo: { ballistic: 450, missile: 0 },
  },
  missileBin: {
    id: 'missileBin',
    name: 'Missile ammo bin',
    kind: 'ammoBin',
    slots: 1,
    tonnage: 1,
    power: 0,
    price: 5000,
    ammo: { ballistic: 0, missile: 36 },
  },
  shieldGenerator: {
    id: 'shieldGenerator',
    name: 'Shield generator',
    kind: 'shield',
    slots: 2,
    tonnage: 3,
    power: 4,
    price: 45000,
    shield: { capacity: 140, duration: 4, cooldown: 14, heat: 12 },
  },
  flareLauncher: {
    id: 'flareLauncher',
    name: 'Flare launcher',
    kind: 'flares',
    slots: 1,
    tonnage: 1,
    power: 0,
    price: 7000,
    flares: { charges: 4, cooldown: 1.5 },
  },
  pointDefense: {
    id: 'pointDefense',
    name: 'Point defense',
    kind: 'pointDefense',
    slots: 1,
    tonnage: 2,
    power: 3,
    price: 26000,
    pointDefense: { range: 190, fireRate: 6, damage: 1, accuracy: 0.7 },
  },
};

/** Which activated equipment goes on equipment action 1 (Q) and 2 (E), in priority order. */
export const EQUIPMENT_ACTION_ORDER: EquipmentKind[] = ['flares', 'shield'];
