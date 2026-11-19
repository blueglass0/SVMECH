/**
 * Loadouts: which weapon sits in which hardpoint, and its weapon group
 * (1 = left click / right stick, 2 = right click / phone button).
 * Milestone 5 makes this editable in the loadout screen.
 */
export interface Loadout {
  chassis: string;
  weapons: { mount: string; weapon: string; group: 1 | 2 }[];
}

export const STARTER_LOADOUT: Loadout = {
  chassis: 'vulture',
  weapons: [
    { mount: 'la-b', weapon: 'autocannon', group: 1 },
    { mount: 'ra-b', weapon: 'machineGun', group: 1 },
    { mount: 'ra-e', weapon: 'laser', group: 2 },
  ],
};

/** Player heat behaviour (shared by all chassis). */
export const HEAT_RULES = {
  /** Warning shows above this fraction of capacity. */
  warnAt: 0.75,
  /** Shutdown length, seconds. */
  shutdownTime: 3,
  /** Heat sheds this many times faster while shut down. */
  shutdownCoolingMultiplier: 3,
};
