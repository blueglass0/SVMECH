import type { Circle } from '../../core/collision';

export type Team = 'player' | 'enemy';

/** Anything shots can hit: the player, tanks, turrets, structures. */
export interface Unit extends Circle {
  team: Team;
  alive: boolean;
  hp: number;
  maxHp: number;
  /** `fromX/fromY` is where the shot came from (milestone 4 uses it for hit locations). */
  takeDamage(amount: number, fromX: number, fromY: number): void;
}
