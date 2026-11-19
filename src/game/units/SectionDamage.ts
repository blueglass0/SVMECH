import { DEG, wrapAngle } from '../../core/math';
import type { Section } from '../../data/chassis';
import { DAMAGE_RULES } from '../../data/damage';

export const SECTIONS: readonly Section[] = ['torso', 'leftArm', 'rightArm', 'legs'];

export interface HitResult {
  /** The section the shot struck (before transfer). */
  section: Section;
  /** Sections destroyed by this hit. */
  destroyed: Section[];
}

/**
 * Per-section armor for a mech. Pure logic: give it the damage and the angle
 * the shot came from (relative to the torso facing) and it decides where it lands.
 */
export class SectionDamage {
  hp: Record<Section, number>;
  /** performance.now() of the last hit per section, for the HUD flash. */
  hitAt: Record<Section, number> = { torso: 0, leftArm: 0, rightArm: 0, legs: 0 };
  private result: HitResult = { section: 'torso', destroyed: [] };

  constructor(readonly max: Readonly<Record<Section, number>>) {
    this.hp = { ...max };
  }

  /** Which section a shot from `relAngle` (radians, 0 = straight ahead, + = mech's right) strikes. */
  static sectionFor(relAngle: number): { section: Section; rear: boolean } {
    const a = wrapAngle(relAngle);
    if (Math.abs(a) <= DAMAGE_RULES.frontDeg * DEG) return { section: 'torso', rear: false };
    if (Math.abs(a) >= Math.PI - DAMAGE_RULES.rearDeg * DEG) return { section: 'torso', rear: true };
    return { section: a > 0 ? 'rightArm' : 'leftArm', rear: false };
  }

  /** Apply a hit. The returned object is reused between calls. */
  apply(amount: number, relAngle: number): HitResult {
    const r = this.result;
    r.destroyed.length = 0;
    const { section, rear } = SectionDamage.sectionFor(relAngle);
    r.section = section;
    const now = performance.now();

    // Legs take a share of every hit; once gone, that share goes to the torso.
    const legPart = amount * DAMAGE_RULES.legShare;
    let main = (amount - legPart) * (rear ? DAMAGE_RULES.rearMultiplier : 1);
    if (this.hp.legs > 0) this.damage('legs', legPart, now);
    else main += legPart;

    // Damage to a missing arm, or beyond what an arm has left, carries into the torso.
    if (section !== 'torso') {
      const left = this.hp[section];
      if (left > 0) {
        this.damage(section, Math.min(left, main), now);
        main = Math.max(0, main - left);
      }
    }
    if (main > 0) this.damage('torso', main, now);
    return r;
  }

  frac(s: Section): number {
    return this.hp[s] / this.max[s];
  }

  destroyed(s: Section): boolean {
    return this.hp[s] <= 0;
  }

  /** Speed and turn multipliers from leg damage: none until legs are fairly damaged, then increasing. */
  legFactors(): { speed: number; turn: number } {
    const f = this.frac('legs');
    const start = DAMAGE_RULES.legPenaltyStart;
    if (f >= start) return { speed: 1, turn: 1 };
    const k = f / start; // 1 at the threshold, 0 when destroyed
    return {
      speed: DAMAGE_RULES.legSpeedMin + (1 - DAMAGE_RULES.legSpeedMin) * k,
      turn: DAMAGE_RULES.legTurnMin + (1 - DAMAGE_RULES.legTurnMin) * k,
    };
  }

  get total(): number {
    return this.hp.torso + this.hp.leftArm + this.hp.rightArm + this.hp.legs;
  }

  get totalMax(): number {
    return this.max.torso + this.max.leftArm + this.max.rightArm + this.max.legs;
  }

  repairAll(): void {
    this.hp = { ...this.max };
  }

  private damage(s: Section, amount: number, now: number): void {
    if (amount <= 0 || this.hp[s] <= 0) return;
    this.hp[s] = Math.max(0, this.hp[s] - amount);
    this.hitAt[s] = now;
    if (this.hp[s] === 0) this.result.destroyed.push(s);
  }
}
