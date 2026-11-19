import Phaser from 'phaser';
import { bakeArt, bakeCombatArt, bakeDamageArt } from '../game/art';

/**
 * First scene. Bakes all vector art into textures once, so gameplay scenes
 * draw cheap sprites instead of re-drawing shapes every frame.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    bakeArt(this);
    bakeCombatArt(this);
    bakeDamageArt(this);
    this.scene.start('Map');
    this.scene.launch('Hud');
  }
}
