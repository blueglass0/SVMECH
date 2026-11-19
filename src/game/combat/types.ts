import type { Circle } from '../../core/collision';

export type Team = 'player' | 'enemy';

/** Anything shots can hit: the player, tanks, turrets, structures. */
export interface Unit extends Circle {
  team: Team;
  alive: boolean;
  hp: number;
  maxHp: number;
  /**
   * `fromX/fromY`: where the shot came from. `hitX/hitY`: where it struck the unit's
   * outline (mechs use it to pick the section hit).
   */
  takeDamage(amount: number, fromX: number, fromY: number, hitX?: number, hitY?: number): void;
  /** Explosion near the unit (shell bursts). Mechs take this in the legs. */
  takeSplash?(amount: number): void;
}
