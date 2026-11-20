import Phaser from 'phaser';
import { ART_SCALE } from './art';
import { CAMERA } from '../config/controls';
import { DEG, approach } from '../core/math';
import type { MechMotor } from './MechMotor';

/** Torso art is drawn a little large; this keeps the feet visible around it. */
const TORSO_SCALE = 0.85;
/** Arm distance from the torso centre, in torso art units. */
const ARM_OFFSET = 25;
/** Distance from the mech centre to the leg heading marker. */
const LEG_TICK_DISTANCE = 52;

/** Sprites for one mech, positioned from its motor each frame. No allocation per frame. */
export class MechView {
  private footL: Phaser.GameObjects.Image;
  private footR: Phaser.GameObjects.Image;
  private hips: Phaser.GameObjects.Image;
  private torso: Phaser.GameObjects.Image;
  private armL: Phaser.GameObjects.Image;
  private armR: Phaser.GameObjects.Image;
  private debugArcs?: Phaser.GameObjects.Image;
  private chevron: Phaser.GameObjects.Image;
  private legTick: Phaser.GameObjects.Image;
  /** 0..1, how much the feet swing. Eases in and out so stopping looks planted. */
  private gait = 0;
  /** Torso and leg markers shown (the player's mech only). */
  private markers: boolean;
  private armIntact = { leftArm: true, rightArm: true };

  constructor(
    scene: Phaser.Scene,
    private motor: MechMotor,
    showMarkers: boolean,
    /** Size relative to the medium mech the art is drawn for. */
    private size = 1,
    /** Texture set: '' (player), '-enemy', or '-wreck'. */
    private skin = '',
  ) {
    const s = size / ART_SCALE;
    this.markers = showMarkers;
    this.legTick = scene.add.image(0, 0, 'leg-tick').setScale(1 / ART_SCALE).setDepth(3).setVisible(showMarkers);
    this.footL = scene.add.image(0, 0, 'mech-foot' + skin).setScale(s).setDepth(4);
    this.footR = scene.add.image(0, 0, 'mech-foot' + skin).setScale(s).setDepth(4);
    this.hips = scene.add.image(0, 0, 'mech-hips' + skin).setScale(s).setDepth(4);
    this.torso = scene.add.image(0, 0, 'mech-torso' + skin).setScale(s * TORSO_SCALE).setDepth(6);
    this.armL = scene.add.image(0, 0, 'mech-arm' + skin).setScale(s * TORSO_SCALE).setDepth(6);
    this.armR = scene.add.image(0, 0, 'mech-arm' + skin).setScale(s * TORSO_SCALE).setDepth(6);
    this.chevron = scene.add.image(0, 0, 'aim-chevron').setScale(1 / ART_SCALE).setVisible(showMarkers).setDepth(10);
  }

  /** Swap the texture set (enemy mechs become wrecks), and drop under live units. */
  setSkin(skin: string, depthOffset = 0): void {
    this.skin = skin;
    this.footL.setTexture('mech-foot' + skin).setDepth(4 + depthOffset);
    this.footR.setTexture('mech-foot' + skin).setDepth(4 + depthOffset);
    this.hips.setTexture('mech-hips' + skin).setDepth(4 + depthOffset);
    this.torso.setTexture('mech-torso' + skin).setDepth(6 + depthOffset);
    this.setArm('leftArm', this.armIntact.leftArm);
    this.setArm('rightArm', this.armIntact.rightArm);
    this.armL.setDepth(6 + depthOffset);
    this.armR.setDepth(6 + depthOffset);
  }

  /** Dim the mech (shutdown, destroyed). */
  setAlpha(a: number): void {
    for (const img of [this.footL, this.footR, this.hips, this.torso, this.armL, this.armR]) img.setAlpha(a);
  }

  setVisible(v: boolean): void {
    for (const img of [this.footL, this.footR, this.hips, this.torso, this.armL, this.armR]) img.setVisible(v);
    for (const img of [this.chevron, this.legTick]) img.setVisible(v && this.markers);
    this.debugArcs?.setVisible(v && this.markers);
  }

  /** Swap an arm for a stump (destroyed) or restore it. */
  setArm(side: 'leftArm' | 'rightArm', intact: boolean): void {
    this.armIntact[side] = intact;
    (side === 'leftArm' ? this.armL : this.armR).setTexture(intact ? 'mech-arm' + this.skin : 'mech-arm-stub');
  }

  /** Debug: show the hit arcs around the mech. */
  showHitArcs(scene: Phaser.Scene): void {
    this.debugArcs = scene.add.image(0, 0, 'debug-arcs').setScale(1 / ART_SCALE).setDepth(3);
  }

  /** World position of an arm (for smoke and explosions). */
  armPosition(side: 'leftArm' | 'rightArm', out: { x: number; y: number }): void {
    const m = this.motor;
    const y = (side === 'leftArm' ? -ARM_OFFSET : ARM_OFFSET) * TORSO_SCALE * this.size;
    out.x = m.pos.x - Math.sin(m.torsoAngle) * y;
    out.y = m.pos.y + Math.cos(m.torsoAngle) * y;
  }

  setMarkersVisible(v: boolean): void {
    this.markers = v;
    this.chevron.setVisible(v);
    this.legTick.setVisible(v);
    this.debugArcs?.setVisible(v);
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
    const lateral = 19 * this.size;

    // Left foot is at -90° from facing (screen y is down, so that's (fy, -fx)).
    this.footL.setPosition(x + fy * lateral + fx * swing, y - fx * lateral + fy * swing).setRotation(m.legAngle);
    this.footR.setPosition(x - fy * lateral - fx * swing, y + fx * lateral - fy * swing).setRotation(m.legAngle);
    this.hips.setPosition(x, y).setRotation(m.legAngle);
    this.legTick.setPosition(x + fx * LEG_TICK_DISTANCE * this.size, y + fy * LEG_TICK_DISTANCE * this.size).setRotation(m.legAngle);
    this.torso.setPosition(x, y).setRotation(m.torsoAngle);
    // Arms sit either side of the body, perpendicular to the torso facing.
    const ax = -Math.sin(m.torsoAngle) * ARM_OFFSET * TORSO_SCALE * this.size;
    const ay = Math.cos(m.torsoAngle) * ARM_OFFSET * TORSO_SCALE * this.size;
    this.armL.setPosition(x - ax, y - ay).setRotation(m.torsoAngle);
    this.armR.setPosition(x + ax, y + ay).setRotation(m.torsoAngle);
    this.debugArcs?.setPosition(x, y).setRotation(m.torsoAngle);
    if (!this.markers) return;

    const d = CAMERA.aimMarkerDistance;
    this.chevron
      .setPosition(x + Math.cos(m.torsoAngle) * d, y + Math.sin(m.torsoAngle) * d)
      .setRotation(m.torsoAngle);
  }
}
