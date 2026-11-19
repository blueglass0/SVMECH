import type { Section } from '../data/chassis';
import type { Loadout } from '../data/loadouts';

export type CombatLevel = 'easy' | 'normal' | 'hard';

/** A mech the player owns, between missions. */
export interface MechState {
  chassis: string;
  weapons: Loadout['weapons'];
  /** Armor left per section. */
  sections: Record<Section, number>;
  ammo: { ballistic: number; missile: number };
  /** Destroyed in battle: must be rebuilt before it can deploy. */
  destroyed: boolean;
}

export type BonusKind = 'turrets' | 'tanks' | 'fast' | 'intact';

export interface BonusObjective {
  kind: BonusKind;
  label: string;
  /** 'fast' only: time limit in seconds. */
  seconds?: number;
}

export interface Contract {
  id: number;
  seed: number;
  tier: 1 | 2 | 3;
  employer: string;
  enemy: string;
  flavor: string;
  targets: number;
  payout: number;
  bonus: BonusObjective;
}

export interface LoanState {
  principal: number;
  /** Still owed, including interest. */
  remaining: number;
  installment: number;
  paymentsLeft: number;
}

export interface CareerState {
  version: 1;
  money: number;
  loan: LoanState | null;
  mech: MechState;
  /** Weapon ids owned but not installed. */
  inventory: string[];
  contracts: Contract[];
  difficulty: { combat: CombatLevel; economy: CombatLevel };
  stats: { missions: number; wins: number; earned: number; spent: number };
  nextContractId: number;
  /** Set while a mission is in progress, so a reload mid-mission counts as a withdrawal. */
  activeContract: number | null;
  over: boolean;
  overReason?: string;
}

/** What the map scene needs to run a contract. */
export interface MissionConfig {
  contract: Contract;
  mech: MechState;
  /** Combat difficulty multipliers (career setting × contract tier). */
  enemyCount: number;
  enemySpread: number;
  enemyDamage: number;
}

/** What the map scene reports when the mission ends. */
export interface MissionOutcome {
  won: boolean;
  withdrew: boolean;
  bonusAchieved: boolean;
  time: number;
  kills: number;
  targetsDestroyed: number;
  targetsTotal: number;
  damageDealt: number;
  damageTaken: number;
  shots: number;
  hits: number;
  ammoUsed: number;
  /** The mech's state at the end (armor, ammo, destroyed). */
  mech: MechState;
}

export interface DebriefLine {
  label: string;
  amount: number;
}

export interface Debrief {
  outcome: MissionOutcome;
  contract: Contract;
  lines: DebriefLine[];
  net: number;
  moneyAfter: number;
  notes: string[];
}
