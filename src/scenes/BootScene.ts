import Phaser from 'phaser';

/**
 * First scene. Later milestones generate vector art into textures here, once,
 * so gameplay scenes draw cheap sprites instead of re-drawing shapes per frame.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Map');
    this.scene.launch('Hud');
  }
}
