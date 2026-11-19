import Phaser from 'phaser';
import { Viewport } from '../core/viewport';
import { DEBUG } from '../core/debug';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const MARGIN = 12;

/**
 * Screen-space UI, laid out in CSS pixels regardless of render resolution.
 * The camera zooms by the render scale, and text renders at that resolution
 * so it stays sharp on high-DPI phones.
 */
export class HudScene extends Phaser.Scene {
  private texts: Phaser.GameObjects.Text[] = [];
  private build!: Phaser.GameObjects.Text;
  private debugText?: Phaser.GameObjects.Text;
  private corners!: Phaser.GameObjects.Graphics;
  private debugTimer = 0;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.addText(MARGIN, MARGIN, 'STEEL VULTURE', {
      fontFamily: FONT,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#e8a33d',
    });
    this.addText(MARGIN, MARGIN + 24, 'Milestone 1 · Foundation', {
      fontFamily: FONT,
      fontSize: '13px',
      color: '#8b98a3',
    });
    this.build = this.addText(0, 0, `build ${__BUILD_ID__}`, {
      fontFamily: MONO,
      fontSize: '11px',
      color: '#56616b',
    }).setOrigin(1, 1);

    if (DEBUG) {
      this.debugText = this.addText(0, MARGIN, '', {
        fontFamily: MONO,
        fontSize: '12px',
        color: '#9fe870',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
        align: 'right',
      }).setOrigin(1, 0);
    }

    // Corner brackets: if all four are visible, nothing is clipped by the screen edge or notch.
    this.corners = this.add.graphics();

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  update(_time: number, delta: number): void {
    if (!this.debugText) return;
    // Refreshing text re-renders a texture, so only do it 4x per second.
    this.debugTimer -= delta;
    if (this.debugTimer > 0) return;
    this.debugTimer = 250;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    this.debugText.setText(
      [
        `${this.game.loop.actualFps.toFixed(0)} fps`,
        `${renderer} ${Viewport.width}×${Viewport.height}`,
        `css ${Math.round(Viewport.cssWidth)}×${Math.round(Viewport.cssHeight)} · dpr ${window.devicePixelRatio.toFixed(2)}`,
        `render scale ${Viewport.renderScale.toFixed(2)}`,
      ].join('\n'),
    );
  }

  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, style).setResolution(Viewport.renderScale);
    this.texts.push(t);
    return t;
  }

  private layout(): void {
    const cam = this.cameras.main;
    cam.setSize(Viewport.width, Viewport.height);
    cam.setOrigin(0, 0);
    cam.setZoom(Viewport.renderScale);
    cam.setScroll(0, 0);

    const w = Viewport.cssWidth;
    const h = Viewport.cssHeight;
    for (const t of this.texts) {
      if (t.style.resolution !== Viewport.renderScale) t.setResolution(Viewport.renderScale);
    }
    this.build.setPosition(w - MARGIN, h - MARGIN);
    this.debugText?.setPosition(w - MARGIN, MARGIN);

    const c = this.corners;
    const len = 18;
    const i = 4;
    c.clear();
    c.lineStyle(2, 0xe8a33d, 0.8);
    // Each corner: two short lines meeting at the corner point.
    for (const [x, y, dx, dy] of [
      [i, i, 1, 1],
      [w - i, i, -1, 1],
      [i, h - i, 1, -1],
      [w - i, h - i, -1, -1],
    ]) {
      c.lineBetween(x, y, x + dx * len, y);
      c.lineBetween(x, y, x, y + dy * len);
    }
  }
}
