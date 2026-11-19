import type { HardpointType } from './chassis';

/**
 * Weapons, for the player and for enemies. Distances in world units, time in
 * seconds, angles in degrees. Tonnage, power and price are used from
 * milestone 5 (loadouts and shop).
 */
export interface WeaponDef {
  id: string;
  name: string;
  /** Short label for the HUD. */
  short: string;
  family: HardpointType;
  /** Projectiles fly and can miss; beams hit instantly along a line. */
  delivery: 'projectile' | 'beam';
  damage: number;
  /** Shots per second. */
  fireRate: number;
  range: number;
  /** Projectile speed, units/s (projectiles only). */
  projectileSpeed: number;
  /** Random spread either side of the aim line, degrees. */
  spread: number;
  /** Heat added per shot. */
  heat: number;
  /** Ammo units used per shot from the family's shared pool (0 = none). */
  ammoPerShot: number;
  power: number;
  tonnage: number;
  price: number;
  /** Visual and sound style. */
  look: 'bullet' | 'shell' | 'laser';
}

export const WEAPONS: Record<string, WeaponDef> = {
  // --- Player weapons (milestone 3 starter set) ---
  machineGun: {
    id: 'machineGun',
    name: 'Machine gun',
    short: 'MG',
    family: 'ballistic',
    delivery: 'projectile',
    damage: 3,
    fireRate: 10,
    range: 430,
    projectileSpeed: 1000,
    spread: 3,
    heat: 0.25,
    ammoPerShot: 1,
    power: 1,
    tonnage: 1,
    price: 4000,
    look: 'bullet',
  },
  autocannon: {
    id: 'autocannon',
    name: 'Autocannon',
    short: 'AC',
    family: 'ballistic',
    delivery: 'projectile',
    damage: 20,
    fireRate: 2,
    range: 600,
    projectileSpeed: 750,
    spread: 1.2,
    heat: 1.5,
    ammoPerShot: 3,
    power: 2,
    tonnage: 6,
    price: 15000,
    look: 'shell',
  },
  laser: {
    id: 'laser',
    name: 'Medium laser',
    short: 'LASER',
    family: 'energy',
    delivery: 'beam',
    damage: 36,
    fireRate: 0.9,
    range: 520,
    projectileSpeed: 0,
    spread: 0,
    heat: 13,
    ammoPerShot: 0,
    power: 8,
    tonnage: 3,
    price: 20000,
    look: 'laser',
  },

  // --- Enemy weapons ---
  tankCannon: {
    id: 'tankCannon',
    name: 'Tank cannon',
    short: 'CN',
    family: 'ballistic',
    delivery: 'projectile',
    damage: 12,
    fireRate: 0.6,
    range: 470,
    projectileSpeed: 520,
    spread: 3,
    heat: 0,
    ammoPerShot: 0,
    power: 0,
    tonnage: 0,
    price: 0,
    look: 'shell',
  },
  turretGun: {
    id: 'turretGun',
    name: 'Turret machine gun',
    short: 'MG',
    family: 'ballistic',
    delivery: 'projectile',
    damage: 2,
    fireRate: 5,
    range: 420,
    projectileSpeed: 800,
    spread: 6,
    heat: 0,
    ammoPerShot: 0,
    power: 0,
    tonnage: 0,
    price: 0,
    look: 'bullet',
  },
  turretCannon: {
    id: 'turretCannon',
    name: 'Turret cannon',
    short: 'CN',
    family: 'ballistic',
    delivery: 'projectile',
    damage: 22,
    fireRate: 0.45,
    range: 560,
    projectileSpeed: 560,
    spread: 2,
    heat: 0,
    ammoPerShot: 0,
    power: 0,
    tonnage: 0,
    price: 0,
    look: 'shell',
  },
};
