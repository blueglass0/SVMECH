import type { Vec } from '../core/math';

/**
 * What the HUD shows, published by the map scene each frame. Plain data, so
 * the HUD never reaches into game objects. Arrays are reused, not reallocated.
 */
export interface GroupStatus {
  label: string;
  /** 0..1, 1 = ready to fire. */
  ready: number;
  /** Out of ammo. */
  empty: boolean;
  /** Has a weapon that uses ammo (show the ammo count next to it). */
  usesAmmo: boolean;
}

export const hud = {
  /** Armor left per section, 0..1. */
  sections: { torso: 1, leftArm: 1, rightArm: 1, legs: 1 },
  /** performance.now() of the last hit per section (silhouette flash). */
  sectionHitAt: { torso: 0, leftArm: 0, rightArm: 0, legs: 0 },
  /** Recent hits on the player: world angle the shot came from, and when. Newest first. */
  hitMarkers: [] as { angle: number; time: number }[],
  playerX: 0,
  playerY: 0,
  heat: 0,
  heatMax: 1,
  heatWarnAt: 0.75,
  /** Seconds of shutdown left. */
  shutdown: 0,
  ammo: 0,
  ammoMax: 0,
  groups: [] as GroupStatus[],
  objectiveLabel: '',
  objectiveDone: 0,
  objectiveTotal: 0,
  briefing: '',
  /** performance.now() of the last hit taken, for the damage flash. */
  lastHit: 0,
  /** Camera view in world units, for off-screen indicators. */
  cam: { x: 0, y: 0, w: 1, h: 1 },
  /** Remaining mission targets and engaged enemies, world positions. */
  targets: [] as Vec[],
  threats: [] as Vec[],
  state: 'active' as 'active' | 'won' | 'lost',
};
