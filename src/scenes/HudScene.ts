import Phaser from 'phaser';
import { Viewport } from '../core/viewport';
import { DEBUG, debugInfo } from '../core/debug';
import { actions, sticks } from '../core/input';
import { settings } from '../core/settings';
import type { StickView } from '../core/input/actions';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const MARGIN = 12;
const STICK_ART_SCALE = 3;

const HINTS = {
  kbm: {
    tank: 'W/S throttle · A/D turn legs · mouse aims torso',
    direction: 'WASD walk in that direction · mouse aims torso',
  },
  touch: { tank: '', direction: '' },
};

/**
 * Screen-space UI, laid out in CSS pixels regardless of render resolution.
 * The camera zooms by the render scale, and text renders at that resolution
 * so it stays sharp on high-DPI phones.
 */
export class HudScene extends Phaser.Scene {
  private texts: Phaser.GameObjects.Text[] = [];
  private hint!: Phaser.GameObjects.Text;
  private hintKey = '';
  private debugText?: Phaser.GameObjects.Text;
  private stickImages: { base: Phaser.GameObjects.Image; knob: Phaser.GameObjects.Image; view: StickView }[] = [];
  private debugTimer = 0;
  private worstFrame = 0;

  constructor() {
    super('Hud');
  }

  create(): void {
    this.addText(MARGIN, MARGIN, 'STEEL VULTURE', {
      fontFamily: FONT,
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#e8a33d',
    });
    this.addText(MARGIN, MARGIN + 21, 'Milestone 2 · Movement', {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#8b98a3',
    });
    this.hint = this.addText(MARGIN, 0, '', {
      fontFamily: FONT,
      fontSize: '13px',
      color: '#8b98a3',
    }).setOrigin(0, 1);
    this.addText(0, 0, `build ${__BUILD_ID__}`, {
      fontFamily: MONO,
      fontSize: '11px',
      color: '#56616b',
    }).setOrigin(1, 1).setName('build');

    if (DEBUG) {
      this.debugText = this.addText(0, 0, '', {
        fontFamily: MONO,
        fontSize: '11px',
        color: '#9fe870',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
        align: 'right',
      }).setOrigin(1, 0);
    }

    for (const view of [sticks.left, sticks.right]) {
      const base = this.add.image(0, 0, 'stick-base').setScale(1 / STICK_ART_SCALE);
      const knob = this.add.image(0, 0, 'stick-knob').setScale(1 / STICK_ART_SCALE);
      this.stickImages.push({ base, knob, view });
    }

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  update(_time: number, delta: number): void {
    // Sticks: moving existing sprites is cheap; no redraw.
    const touch = actions.device === 'touch';
    for (const s of this.stickImages) {
      s.base.setVisible(touch).setPosition(s.view.baseX, s.view.baseY).setAlpha(s.view.active ? 1 : 0.5);
      s.knob.setVisible(touch).setPosition(s.view.knobX, s.view.knobY).setAlpha(s.view.active ? 1 : 0.5);
    }

    // Hint text only changes when the device or scheme does.
    const scheme = settings.scheme[actions.device];
    const key = actions.device + scheme;
    if (key !== this.hintKey) {
      this.hintKey = key;
      this.hint.setText(HINTS[actions.device][scheme]);
    }

    if (!this.debugText) return;
    this.worstFrame = Math.max(this.worstFrame, delta);
    // Refreshing text re-renders a texture, so only do it 4x per second.
    this.debugTimer -= delta;
    if (this.debugTimer > 0) return;
    this.debugTimer = 250;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    this.debugText.setText(
      [
        `${this.game.loop.actualFps.toFixed(0)} fps · worst ${this.worstFrame.toFixed(0)} ms`,
        `${renderer} ${Viewport.width}×${Viewport.height} · scale ${Viewport.renderScale.toFixed(2)}`,
        `css ${Math.round(Viewport.cssWidth)}×${Math.round(Viewport.cssHeight)} · dpr ${window.devicePixelRatio.toFixed(2)}`,
        ...Object.values(debugInfo),
      ].join('\n'),
    );
    this.worstFrame = 0;
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
    (this.children.getByName('build') as Phaser.GameObjects.Text).setPosition(w - MARGIN, h - MARGIN);
    this.hint.setPosition(MARGIN, h - MARGIN);
    // Below the DOM toolbar in the top-right corner.
    this.debugText?.setPosition(w - MARGIN, 56);
  }
}
