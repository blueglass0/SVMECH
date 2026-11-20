import { CHASSIS, SIZE_RANK, type ChassisDef, type MountDef, type Section } from '../data/chassis';
import { EQUIPMENT, EQUIPMENT_ACTION_ORDER, type EquipmentDef } from '../data/equipment';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import type { Loadout } from '../data/loadouts';

/** Everything derived from a loadout: limits, heat, armor, ammo, equipment. Pure. */
export interface MechStats {
  chassis: ChassisDef;
  tonnage: number;
  maxTonnage: number;
  slotsUsed: number;
  slots: number;
  reactors: EquipmentDef[];
  powerOutput: number;
  powerDraw: number;
  heatCapacity: number;
  /** Heat shed per second by chassis and heat sinks. */
  dissipation: number;
  /** Heat the reactor adds every second. */
  passiveHeat: number;
  /** Max armor per section, including plating. */
  sections: Record<Section, number>;
  ammoCapacity: { ballistic: number; missile: number };
  shield?: NonNullable<EquipmentDef['shield']>;
  flares?: NonNullable<EquipmentDef['flares']>;
  pointDefense?: NonNullable<EquipmentDef['pointDefense']>;
  /** Activated equipment on action 1 (Q) and 2 (E). */
  actions: ('flares' | 'shield')[];
  /** Fog of war: cone half-angle (degrees), cone range, all-round radius, radar range (0 = none). */
  vision: { coneDeg: number; range: number; radius: number; radar: number };
}

export function mechStats(l: Pick<Loadout, 'chassis' | 'weapons' | 'equipment'>): MechStats {
  const c = CHASSIS[l.chassis];
  const eq = l.equipment.map((id) => EQUIPMENT[id]).filter(Boolean);
  const sum = (f: (e: EquipmentDef) => number) => eq.reduce((t, e) => t + f(e), 0);
  const sections = { ...c.sections };
  for (const e of eq) if (e.armor) for (const s of Object.keys(sections) as Section[]) sections[s] += e.armor[s];
  const ammo = { ...c.ammoCapacity };
  for (const e of eq) if (e.ammo) {
    ammo.ballistic += e.ammo.ballistic;
    ammo.missile += e.ammo.missile;
  }
  const find = <K extends 'shield' | 'flares' | 'pointDefense'>(k: K) => eq.find((e) => e[k])?.[k] as EquipmentDef[K] | undefined;
  const shield = find('shield');
  const flares = find('flares');
  const actions = EQUIPMENT_ACTION_ORDER.filter((k) => (k === 'shield' ? shield : k === 'flares' ? flares : false)) as MechStats['actions'];
  return {
    chassis: c,
    tonnage: c.baseTonnage + l.weapons.reduce((t, w) => t + WEAPONS[w.weapon].tonnage, 0) + sum((e) => e.tonnage),
    maxTonnage: c.maxTonnage,
    // The reactor has its own place; only other equipment uses internal slots.
    slotsUsed: sum((e) => (e.kind === 'reactor' ? 0 : e.slots)),
    slots: c.internalSlots,
    reactors: eq.filter((e) => e.kind === 'reactor'),
    powerOutput: c.power + sum((e) => e.output ?? 0),
    powerDraw: l.weapons.reduce((t, w) => t + WEAPONS[w.weapon].power, 0) + sum((e) => e.power),
    heatCapacity: c.heatCapacity,
    dissipation: c.heatDissipation + sum((e) => e.dissipation ?? 0),
    passiveHeat: sum((e) => e.passiveHeat ?? 0),
    sections,
    ammoCapacity: ammo,
    shield,
    flares,
    pointDefense: find('pointDefense'),
    actions,
    vision: {
      // Several sensors don't stack: the best one counts.
      coneDeg: c.vision.coneDeg + Math.max(0, ...eq.map((e) => e.sensors?.coneDeg ?? 0)),
      range: c.vision.range + Math.max(0, ...eq.map((e) => e.sensors?.range ?? 0)),
      radius: c.vision.radius,
      radar: Math.max(0, ...eq.map((e) => e.sensors?.radar ?? 0)),
    },
  };
}

/** Does a weapon fit a mount? Right kind (direct-fire or back), and no bigger than the mount. */
export function fitsMount(w: WeaponDef, mount: MountDef): boolean {
  return w.slot === mount.kind && SIZE_RANK[w.size] <= SIZE_RANK[mount.size];
}
