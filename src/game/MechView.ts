import Phaser from 'phaser';
import { ART_SCALE } from './art';
import { CAMERA } from '../config/controls';
import { DEG, approach } from '../core/math';
import type { MechMotor } from './MechMotor';

/** Torso art is drawn a little large; this keeps the feet visible around it. */
const TORSO_SCALE = 0.85;
/** Distance from the mech centre to the leg heading marker. */
const LEG_TICK_DISTANCE = 52;

/** Sprites for one mech, positioned from its motor each frame. No allocation per frame. */
export class MechView {
  private footL: Phaser.GameObjects.Image;
  private footR: Phaser.GameObjects.Image;
  private hips: Phaser.GameObjects.Image;
  private torso: Phaser.GameObjects.Image;
  private chevron: Phaser.GameObjects.Image;
  private legTick: Phaser.GameObjects.Image;
  /** 0..1, how much the feet swing. Eases in and out so stopping looks planted. */
  private gait = 0;

  constructor(
    scene: Phaser.Scene,
    private motor: MechMotor,
    showAimMarker: boolean,
  ) {
    const s = 1 / ART_SCALE;
    this.legTick = scene.add.image(0, 0, 'leg-tick').setScale(s);
    this.footL = scene.add.image(0, 0, 'mech-foot').setScale(s);
    this.footR = scene.add.image(0, 0, 'mech-foot').setScale(s);
    this.hips = scene.add.image(0, 0, 'mech-hips').setScale(s);
    this.torso = scene.add.image(0, 0, 'mech-torso').setScale(s * TORSO_SCALE);
    this.chevron = scene.add.image(0, 0, 'aim-chevron').setScale(s).setVisible(showAimMarker);
  }

  update(dt: number): void {
    const m = this.motor;
    const mv = m.move;
    const activity = Math.min(1, Math.abs(m.speed) / mv.maxSpeed * 1.5 + Math.abs(m.legTurnVel) / (mv.legTurnRate * DEG) * 0.6);
    this.gait = approach(this.gait, activity, dt * 3);

    const { x, y } = m.pos;
    const fx = Math.cos(m.legAngle);
    const fy = Math.sin(m.legAngle);
    const swing = Math.sin(m.stridePhase) * mv.strideLength * 0.35 * this.gait;
    const lateral = 19;

    // Left foot is at -90° from facing (screen y is down, so that's (fy, -fx)).
    this.footL.setPosition(x + fy * lateral + fx * swing, y - fx * lateral + fy * swing).setRotation(m.legAngle);
    this.footR.setPosition(x - fy * lateral - fx * swing, y + fx * lateral - fy * swing).setRotation(m.legAngle);
    this.hips.setPosition(x, y).setRotation(m.legAngle);
    this.legTick.setPosition(x + fx * LEG_TICK_DISTANCE, y + fy * LEG_TICK_DISTANCE).setRotation(m.legAngle);
    this.torso.setPosition(x, y).setRotation(m.torsoAngle);

    const d = CAMERA.aimMarkerDistance;
    this.chevron
      .setPosition(x + Math.cos(m.torsoAngle) * d, y + Math.sin(m.torsoAngle) * d)
      .setRotation(m.torsoAngle);
  }
}
