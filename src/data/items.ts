import { EQUIPMENT } from './equipment';
import { WEAPONS } from './weapons';

/** Shop items are weapons or equipment; ids are unique across both. */
export function isWeapon(id: string): boolean {
  return id in WEAPONS;
}

export function isEquipment(id: string): boolean {
  return id in EQUIPMENT;
}

export function itemName(id: string): string {
  return WEAPONS[id]?.name ?? EQUIPMENT[id]?.name ?? id;
}

export function itemPrice(id: string): number {
  return WEAPONS[id]?.price ?? EQUIPMENT[id]?.price ?? 0;
}
