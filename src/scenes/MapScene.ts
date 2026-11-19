import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { TEST_MAP } from '../data/testMap';
import { Viewport } from '../core/viewport';

/**
 * The world. For milestone 1 it is an empty arena: ground, grid, border and a
 * centre marker. The camera drifts slowly so smoothness can be judged by eye.
 */
export class MapScene extends Phaser.Scene {
  private elapsed = 0;

  constructor() {
    super('Map');
  }

  create(): void {
    const m = TEST_MAP;
    const g = this.add.graphics();

    g.fillStyle(m.colors.ground, 1);
    g.fillRect(0, 0, m.width, m.height);

    // Minor grid first, then major lines over it.
    g.lineStyle(2, m.colors.gridMinor, 1);
    for (let x = m.gridMinor; x < m.width; x += m.gridMinor) {
      if (x % m.gridMajor !== 0) g.lineBetween(x, 0, x, m.height);
    }
    for (let y = m.gridMinor; y < m.height; y += m.gridMinor) {
      if (y % m.gridMajor !== 0) g.lineBetween(0, y, m.width, y);
    }
    g.lineStyle(3, m.colors.gridMajor, 1);
    for (let x = m.gridMajor; x < m.width; x += m.gridMajor) g.lineBetween(x, 0, x, m.height);
    for (let y = m.gridMajor; y < m.height; y += m.gridMajor) g.lineBetween(0, y, m.width, y);

    g.lineStyle(6, m.colors.border, 1);
    g.strokeRect(0, 0, m.width, m.height);

    // Centre marker: a ring with a cross, about the footprint of a mech.
    const cx = m.width / 2;
    const cy = m.height / 2;
    g.lineStyle(4, m.colors.marker, 1);
    g.strokeCircle(cx, cy, 48);
    g.lineBetween(cx - 72, cy, cx - 24, cy);
    g.lineBetween(cx + 24, cy, cx + 72, cy);
    g.lineBetween(cx, cy - 72, cx, cy - 24);
    g.lineBetween(cx, cy + 24, cx, cy + 72);

    const cam = this.cameras.main;
    cam.setBackgroundColor(DISPLAY.background);
    cam.setBounds(0, 0, m.width, m.height);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });
  }

  update(_time: number, delta: number): void {
    // Slow orbit around the centre (placeholder until the mech exists).
    this.elapsed += delta / 1000;
    const r = 160;
    const t = this.elapsed * 0.25;
    this.cameras.main.centerOn(TEST_MAP.width / 2 + Math.cos(t) * r, TEST_MAP.height / 2 + Math.sin(t) * r);
  }

  /** Same visible world area on every screen: `viewShortAxis` units on the short side. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    cam.setSize(Viewport.width, Viewport.height);
    cam.setZoom(Math.min(Viewport.width, Viewport.height) / DISPLAY.viewShortAxis);
  }
}
