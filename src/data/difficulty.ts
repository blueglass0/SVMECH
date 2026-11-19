/**
 * Combat difficulty multipliers. Chosen when starting a career (milestone 11
 * adds the menu); 'normal' is used until then.
 */
export interface CombatDifficulty {
  /** Multiplies the number of turrets and tanks. */
  enemyCount: number;
  /** Multiplies enemy weapon spread (higher = less accurate). */
  enemySpread: number;
  /** Multiplies enemy weapon damage. */
  enemyDamage: number;
}

export const COMBAT_DIFFICULTY: Record<'easy' | 'normal' | 'hard', CombatDifficulty> = {
  easy: { enemyCount: 0.7, enemySpread: 1.6, enemyDamage: 0.7 },
  normal: { enemyCount: 1, enemySpread: 1, enemyDamage: 1 },
  hard: { enemyCount: 1.4, enemySpread: 0.7, enemyDamage: 1.3 },
};

export const ACTIVE_COMBAT_DIFFICULTY: keyof typeof COMBAT_DIFFICULTY = 'normal';
