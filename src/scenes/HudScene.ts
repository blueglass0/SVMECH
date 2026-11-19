import Phaser from 'phaser';
import { Viewport } from '../core/viewport';
import { DEBUG, debugInfo } from '../core/debug';
import { actions, sticks, touchButtons } from '../core/input';
import { settings } from '../core/settings';
import { CONTROLS } from '../config/controls';
import type { StickView } from '../core/input/actions';
import { hud } from '../game/hudState';
import type { Section } from '../data/chassis';

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const MARGIN = 12;
const HUD_ART_SCALE = 3;
const PANEL_W = 254;
const BAR_W = 150;
const GROUP_BAR_W = 184;
const HIT_ARC_TIME = 1.2;
const EDGE_INSET = 30;
const EDGE_TOP_INSET = 64;

const HINTS = {
  kbm: {
    tank: 'W/S throttle · A/D turn · mouse aims · left click: group 1 · right click: group 2',
    direction: 'WASD walk · mouse aims · left click: group 1 · right click: group 2',
  },
  touch: { tank: '', direction: '' },
};

type Img = Phaser.GameObjects.Image;
type Txt = Phaser.GameObjects.Text;

/**
 * Screen-space UI, laid out in CSS pixels regardless of render resolution.
 * Reads only `hud` (published by the map scene) and the input view state.
 * Bars are scaled images and text is only re-rendered when its value changes.
 */
export class HudScene extends Phaser.Scene {
  private texts: Txt[] = [];
  private hint!: Txt;
  private hintKey = '';
  private objective!: Txt;
  private bonus!: Txt;
  private briefing!: Txt;
  private warning!: Txt;
  private groupTexts: Txt[] = [];
  private build!: Txt;
  private debugText?: Txt;
  private panelBg!: Img;
  private silhouette: { img: Img; section: Section; base: string; dx: number; dy: number }[] = [];
  private hitArcs: Img[] = [];
  private fireRing!: Img;
  private heatBar!: Img;
  private heatWarnTick!: Img;
  private groupBars: { bg: Img; fill: Img }[] = [];
  private barBgs: Img[] = [];
  private flash!: Img;
  private targetArrows: Img[] = [];
  private threatArrows: Img[] = [];
  private stickImages: { base: Img; knob: Img; view: StickView }[] = [];
  private fire2!: { img: Img; label: Txt };
  private equipButtons: { img: Img; label: Txt }[] = [];
  private equipText!: Txt;
  private layoutEquipCount = -1;
  private shown: Record<string, string> = {};
  private textTimer = 0;
  private debugTimer = 0;
  private worstFrame = 0;
  private layoutDevice = '';

  constructor() {
    super('Hud');
  }

  create(): void {
    this.texts = [];
    this.groupTexts = [];
    this.groupBars = [];
    this.barBgs = [];
    this.silhouette = [];
    this.hitArcs = [];
    this.targetArrows = [];
    this.threatArrows = [];
    this.stickImages = [];
    this.shown = {};
    this.hintKey = '';

    this.flash = this.add.image(0, 0, 'px-hot').setOrigin(0, 0).setAlpha(0);

    this.objective = this.addText(MARGIN, MARGIN, '', { fontFamily: FONT, fontSize: '14px', fontStyle: 'bold', color: '#e8a33d' });
    this.bonus = this.addText(MARGIN, MARGIN + 20, '', { fontFamily: FONT, fontSize: '12px', color: '#8b98a3' });
    this.briefing = this.addText(0, 0, '', {
      fontFamily: FONT,
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: '#0b0e11cc',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5, 0);
    this.warning = this.addText(0, 0, '', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#ff4d3d' }).setOrigin(0.5);
    this.hint = this.addText(MARGIN, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#8b98a3' }).setOrigin(0, 1);
    this.build = this.addText(0, 0, `build ${__BUILD_ID__}`, { fontFamily: MONO, fontSize: '10px', color: '#56616b' }).setOrigin(1, 1);

    // Status panel: armor, heat, weapon groups, ammo.
    this.panelBg = this.add.image(0, 0, 'px-bg').setOrigin(0, 0);
    const label = { fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#8b98a3' };
    this.addText(0, 0, 'HEAT', label).setName('lbl-heat');
    // Mech silhouette (seen from above, facing up): each section coloured by condition.
    this.silhouette = [
      { section: 'torso', base: 'sil-torso', dx: 0, dy: -7 },
      { section: 'leftArm', base: 'sil-arm', dx: -16, dy: -7 },
      { section: 'rightArm', base: 'sil-arm', dx: 16, dy: -7 },
      { section: 'legs', base: 'sil-legs', dx: 0, dy: 18 },
    ].map((p) => ({
      ...(p as { section: Section; base: string; dx: number; dy: number }),
      img: this.add.image(0, 0, `${p.base}-0`).setScale(1.25 / HUD_ART_SCALE),
    }));
    for (let i = 0; i < 6; i++) this.hitArcs.push(this.add.image(0, 0, 'hit-arc').setScale(1 / HUD_ART_SCALE).setVisible(false));
    this.heatBar = this.bar('px-heat');
    this.heatWarnTick = this.add.image(0, 0, 'px-white').setOrigin(0.5, 0).setAlpha(0.7);
    for (let g = 0; g < 2; g++) {
      this.groupTexts.push(this.addText(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#d6dde3' }));
      const bg = this.add.image(0, 0, 'px-dim').setOrigin(0, 0);
      const fill = this.add.image(0, 0, 'px-cyan').setOrigin(0, 0);
      this.groupBars.push({ bg, fill });
    }

    for (let i = 0; i < 6; i++) this.targetArrows.push(this.add.image(0, 0, 'edge-target').setScale(1 / HUD_ART_SCALE).setVisible(false));
    for (let i = 0; i < 12; i++) this.threatArrows.push(this.add.image(0, 0, 'edge-threat').setScale(1 / HUD_ART_SCALE).setVisible(false));

    this.fireRing = this.add.image(0, 0, 'stick-ring').setScale(1 / HUD_ART_SCALE);
    for (const view of [sticks.left, sticks.right]) {
      const base = this.add.image(0, 0, 'stick-base').setScale(1 / HUD_ART_SCALE);
      const knob = this.add.image(0, 0, 'stick-knob').setScale(1 / HUD_ART_SCALE);
      this.stickImages.push({ base, knob, view });
    }
    this.equipButtons = [0, 1].map(() => ({
      img: this.add.image(0, 0, 'button').setScale((CONTROLS.equipButtonRadius / 40) / HUD_ART_SCALE),
      label: this.addText(0, 0, '', { fontFamily: FONT, fontSize: '10px', fontStyle: 'bold', color: '#d6dde3', align: 'center' }).setOrigin(0.5),
    }));
    this.equipText = this.addText(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: 'bold', color: '#7fe6ff' });
    this.fire2 = {
      img: this.add.image(0, 0, 'button').setScale((CONTROLS.buttonRadius / 40) / HUD_ART_SCALE),
      label: this.addText(0, 0, '2', { fontFamily: FONT, fontSize: '16px', fontStyle: 'bold', color: '#d6dde3' }).setOrigin(0.5),
    };

    if (DEBUG) {
      this.debugText = this.addText(0, 0, '', {
        fontFamily: MONO,
        fontSize: '10px',
        color: '#9fe870',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
        align: 'right',
      }).setOrigin(1, 0);
    }

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });
  }

  update(_time: number, delta: number): void {
    const w = Viewport.cssWidth;
    const h = Viewport.cssHeight;
    const touch = actions.device === 'touch';
    if (actions.device !== this.layoutDevice) this.layout();

    // Touch controls.
    for (const s of this.stickImages) {
      const a = s.view.active ? 1 : 0.5;
      s.base.setVisible(touch).setPosition(s.view.baseX, s.view.baseY).setAlpha(a);
      s.knob.setVisible(touch).setPosition(s.view.knobX, s.view.knobY).setAlpha(a);
    }
    this.fireRing.setVisible(touch).setPosition(sticks.right.baseX, sticks.right.baseY).setAlpha(actions.fire1 || actions.fire2 ? 1 : 0.6);
    const b = touchButtons.swap;
    this.fire2.img.setVisible(touch).setPosition(b.x, b.y).setAlpha(b.pressed ? 1 : 0.6);
    this.fire2.label.setVisible(touch).setPosition(b.x, b.y);
    this.setTextIfChanged(this.fire2.label, 'swap', `⇄${actions.stickGroup}`);
    [touchButtons.equip1, touchButtons.equip2].forEach((eb, i) => {
      const st = hud.equipment[i];
      const show = touch && eb.visible && !!st;
      const ui = this.equipButtons[i];
      ui.img.setVisible(show).setPosition(eb.x, eb.y).setAlpha(eb.pressed || st?.active ? 1 : st?.ready ? 0.65 : 0.3);
      ui.label.setVisible(show).setPosition(eb.x, eb.y);
      if (st) this.setTextIfChanged(ui.label, 'eqb' + i, st.label.replace(' ', '\n'));
    });
    if (hud.equipment.length !== this.layoutEquipCount) this.layout();
    // On phones, light up the group the right stick fires.
    for (let i = 0; i < this.groupTexts.length; i++) {
      const active = !touch || actions.stickGroup === i + 1;
      this.groupTexts[i].setAlpha(active ? 1 : 0.45);
    }

    // Bars (cheap: just scale images).
    const now = performance.now();
    for (const piece of this.silhouette) {
      const f = hud.sections[piece.section];
      const flash = now - hud.sectionHitAt[piece.section] < 150;
      const c = flash ? 5 : f <= 0 ? 4 : f < 0.25 ? 3 : f < 0.5 ? 2 : f < 0.75 ? 1 : 0;
      const key = `${piece.base}-${c}`;
      if (piece.img.texture.key !== key) piece.img.setTexture(key);
    }

    // Hit direction arcs around the mech, fading out.
    const px = ((hud.playerX - hud.cam.x) / hud.cam.w) * w;
    const py = ((hud.playerY - hud.cam.y) / hud.cam.h) * h;
    for (let i = 0; i < this.hitArcs.length; i++) {
      const m = hud.hitMarkers[i];
      const age = m ? (now - m.time) / 1000 : 99;
      const arc = this.hitArcs[i];
      if (age > HIT_ARC_TIME) {
        arc.setVisible(false);
        continue;
      }
      arc.setVisible(true).setPosition(px, py).setRotation(m.angle).setAlpha(1 - age / HIT_ARC_TIME);
    }
    const heatFrac = Math.min(1, hud.heat / hud.heatMax);
    this.heatBar.setDisplaySize(Math.max(0.01, BAR_W * heatFrac), 8).setTexture(heatFrac >= hud.heatWarnAt ? 'px-hot' : 'px-heat');
    hud.groups.forEach((g, i) => {
      const bar = this.groupBars[i];
      bar.fill.setDisplaySize(Math.max(0.01, GROUP_BAR_W * g.ready), 3).setTexture(g.empty ? 'px-hot' : g.ready >= 1 ? 'px-cyan' : 'px-heat');
    });

    // Damage flash.
    const sinceHit = (performance.now() - hud.lastHit) / 1000;
    this.flash.setAlpha(hud.lastHit > 0 && sinceHit < 0.3 ? 0.12 * (1 - sinceHit / 0.3) : 0);

    // Warnings blink.
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    let warn = '';
    if (hud.shutdown > 0) warn = `SHUTDOWN  ${hud.shutdown.toFixed(1)}`;
    else if (hud.missileWarning) warn = blink ? 'MISSILE INCOMING' : '';
    else if (heatFrac >= hud.heatWarnAt) warn = blink ? 'HEAT CRITICAL' : '';
    this.setTextIfChanged(this.warning, 'warn', warn);

    // Off-screen indicators.
    this.placeArrows(this.targetArrows, hud.targets, w, h);
    this.placeArrows(this.threatArrows, hud.threats, w, h);

    // Slower-changing text, throttled.
    this.textTimer -= delta;
    if (this.textTimer <= 0) {
      this.textTimer = 100;
      this.setTextIfChanged(this.objective, 'obj', `${hud.objectiveLabel.toUpperCase()}  ${hud.objectiveDone} / ${hud.objectiveTotal}`);
      const keys = touch ? ['', ''] : ['Q ', 'E '];
      this.setTextIfChanged(this.equipText, 'eqt', hud.equipment.map((e, i) => `${keys[i]}${e.label}${e.active ? ' ●' : ''}`).join('     '));
      const mark = hud.bonusState === 'done' ? '  ✓' : hud.bonusState === 'failed' ? '  ✗' : '';
      if (this.setTextIfChanged(this.bonus, 'bonus', hud.bonusLabel ? `Bonus: ${hud.bonusLabel}${mark}` : '')) {
        this.bonus.setColor(hud.bonusState === 'done' ? '#8fd16a' : hud.bonusState === 'failed' ? '#ff6a5a' : '#8b98a3');
      }
      this.setTextIfChanged(this.briefing, 'brief', hud.briefing);
      this.briefing.setVisible(hud.briefing !== '');
      hud.groups.forEach((g, i) =>
        this.setTextIfChanged(
          this.groupTexts[i],
          'g' + i,
          `${i + 1}  ${g.label}${g.usesAmmo ? `  ·  ${Math.floor(hud.ammo)}` : ''}${g.usesMissiles ? `  ·  ${hud.ammoMissile} msl` : ''}`,
        ),
      );
      const scheme = settings.scheme[actions.device];
      const key = actions.device + scheme;
      if (key !== this.hintKey) {
        this.hintKey = key;
        this.hint.setText(HINTS[actions.device][scheme]);
      }
    }

    if (!this.debugText) return;
    this.worstFrame = Math.max(this.worstFrame, delta);
    this.debugTimer -= delta;
    if (this.debugTimer > 0) return;
    this.debugTimer = 250;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
    this.debugText.setText(
      [
        `${this.game.loop.actualFps.toFixed(0)} fps · worst ${this.worstFrame.toFixed(0)} ms`,
        `${renderer} ${Viewport.width}×${Viewport.height} · scale ${Viewport.renderScale.toFixed(2)}`,
        `css ${Math.round(w)}×${Math.round(h)} · dpr ${window.devicePixelRatio.toFixed(2)}`,
        ...Object.values(debugInfo),
      ].join('\n'),
    );
    this.worstFrame = 0;
  }

  /** Point an arrow at the screen edge toward each off-screen position. */
  private placeArrows(arrows: Img[], points: { x: number; y: number }[], w: number, h: number): void {
    const c = hud.cam;
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < arrows.length; i++) {
      const arrow = arrows[i];
      const p = points[i];
      if (!p) {
        arrow.setVisible(false);
        continue;
      }
      const sx = ((p.x - c.x) / c.w) * w;
      const sy = ((p.y - c.y) / c.h) * h;
      if (sx > 0 && sx < w && sy > 0 && sy < h) {
        arrow.setVisible(false);
        continue;
      }
      const dx = sx - cx;
      const dy = sy - cy;
      // The top edge is inset further to keep arrows clear of the toolbar.
      const insetY = dy < 0 ? EDGE_TOP_INSET : EDGE_INSET;
      const t = Math.min((cx - EDGE_INSET) / Math.abs(dx || 1e-6), (cy - insetY) / Math.abs(dy || 1e-6));
      arrow.setVisible(true).setPosition(cx + dx * t, cy + dy * t).setRotation(Math.atan2(dy, dx));
    }
  }

  private setTextIfChanged(t: Txt, key: string, value: string): boolean {
    if (this.shown[key] === value) return false;
    this.shown[key] = value;
    t.setText(value);
    return true;
  }

  private bar(texture: string): Img {
    this.barBgs.push(this.add.image(0, 0, 'px-dim').setOrigin(0, 0));
    return this.add.image(0, 0, texture).setOrigin(0, 0);
  }

  private addText(x: number, y: number, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Txt {
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
    this.flash.setDisplaySize(w, h);
    this.build.setPosition(w - MARGIN, h - 4);
    this.hint.setPosition(MARGIN, h - MARGIN);
    this.briefing.setPosition(w / 2, Math.max(52, h * 0.16));
    this.warning.setPosition(w / 2, h * 0.3);
    this.debugText?.setPosition(w - MARGIN, 52);

    // Status panel: bottom centre (between the thumbs on phones).
    // Equipment line (PC keys) only when equipment with actions is fitted.
    this.layoutEquipCount = hud.equipment.length;
    const panelH = 66 + (hud.equipment.length > 0 ? 16 : 0);
    this.layoutDevice = actions.device;
    const px = Math.round(w / 2 - PANEL_W / 2);
    const py = Math.round(h - panelH - (actions.device === 'touch' ? 6 : 26));
    this.panelBg.setPosition(px, py).setDisplaySize(PANEL_W, panelH);
    // Silhouette on the left, heat and weapon groups on the right.
    const sx = px + 30;
    const sy = py + 32;
    for (const piece of this.silhouette) piece.img.setPosition(sx + piece.dx, sy + piece.dy);
    const x0 = px + 60;
    const barX = x0 + 34;
    (this.children.getByName('lbl-heat') as Txt).setPosition(x0, py + 7);
    this.barBgs[0].setPosition(barX, py + 9).setDisplaySize(BAR_W, 8);
    this.heatBar.setPosition(barX, py + 9);
    this.heatWarnTick.setPosition(barX + BAR_W * hud.heatWarnAt, py + 7).setDisplaySize(2, 12);
    for (let g = 0; g < 2; g++) {
      const gy = py + 22 + g * 22;
      this.equipText.setPosition(x0, py + 66);
      this.groupTexts[g].setPosition(x0, gy);
      this.groupBars[g].bg.setPosition(x0, gy + 15).setDisplaySize(GROUP_BAR_W, 3);
      this.groupBars[g].fill.setPosition(x0, gy + 15);
    }
  }
}
