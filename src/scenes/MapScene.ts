import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { CAMERA } from '../config/controls';
import { CHASSIS, STARTER_CHASSIS, type ChassisMovement } from '../data/chassis';
import { TEST_ARENA } from '../data/testArena';
import { Viewport } from '../core/viewport';
import { InputSystem, actions } from '../core/input';
import { settings } from '../core/settings';
import { DEG, clamp, smoothing, type Vec } from '../core/math';
import { debugInfo } from '../core/debug';
import { portraitPhone } from '../core/orientation';
import { ART_SCALE, bakeGroundTile } from '../game/art';
import { MechMotor } from '../game/MechMotor';
import { MechView } from '../game/MechView';

/**
 * The world: the test arena, the player mech and the camera.
 * Milestone 2: movement only, no weapons yet.
 */
export class MapScene extends Phaser.Scene {
  private controls!: InputSystem;
  private mech!: MechMotor;
  private mechView!: MechView;
  /** Live, tunable copy of the chassis movement numbers (see the tuning panel). */
  movement!: ChassisMovement;
  private aimWorld: Vec = { x: 0, y: 0 };
  private camPos: Vec = { x: 0, y: 0 };
  private lead: Vec = { x: 0, y: 0 };
  private debugTimer = 0;

  constructor() {
    super('Map');
  }

  create(): void {
    const a = TEST_ARENA;
    this.drawArena();

    const chassis = CHASSIS[STARTER_CHASSIS];
    this.movement = { ...chassis.movement };
    this.mech = new MechMotor(this.movement, chassis.radius, a.spawn.x, a.spawn.y, a.spawn.angleDeg * DEG);
    this.mechView = new MechView(this, this.mech, true);
    this.controls = new InputSystem(this);

    const cam = this.cameras.main;
    cam.setBackgroundColor(DISPLAY.background);
    cam.setBounds(0, 0, a.width, a.height);
    this.camPos = { ...this.mech.pos };
    this.fitCamera();
    cam.centerOn(this.camPos.x, this.camPos.y);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });

    // Started on a phone held upright: wait behind the rotate prompt.
    if (portraitPhone.matches) this.scene.pause();
  }

  /** Release every held input (used when the game is paused, e.g. by the rotate prompt). */
  releaseInput(): void {
    this.controls.reset();
  }

  update(_time: number, deltaMs: number): void {
    // Clamp long frames (tab switches, hitches) so nothing jumps.
    const dt = Math.min(deltaMs, 100) / 1000;
    this.controls.update();

    const cam = this.cameras.main;
    const scheme = settings.scheme[actions.device];
    const m = this.mech;

    // Turn the aim input into a world point.
    let aimTarget: Vec | null = null;
    const lead = this.lead;
    lead.x = lead.y = 0;
    if (actions.aimMode === 'point') {
      const p = cam.getWorldPoint(actions.aim.x, actions.aim.y);
      this.aimWorld.x = p.x;
      this.aimWorld.y = p.y;
      aimTarget = this.aimWorld;
      const dx = p.x - m.pos.x;
      const dy = p.y - m.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const l = Math.min(d * CAMERA.leadFraction, CAMERA.leadMax);
      lead.x = (dx / d) * l;
      lead.y = (dy / d) * l;
    } else if (actions.aimMode === 'direction') {
      this.aimWorld.x = m.pos.x + actions.aim.x * 1000;
      this.aimWorld.y = m.pos.y + actions.aim.y * 1000;
      aimTarget = this.aimWorld;
      lead.x = actions.aim.x * CAMERA.leadMax * 0.6;
      lead.y = actions.aim.y * CAMERA.leadMax * 0.6;
    }

    const stepped = m.update(dt, scheme, actions.move, aimTarget, TEST_ARENA.obstacles, TEST_ARENA);
    this.mechView.update(dt);
    if (stepped && this.movement.stepShake > 0 && Math.abs(m.speed) > 20) {
      cam.shake(90, this.movement.stepShake, false);
    }

    // Camera: smooth follow with a lead toward the aim.
    const k = smoothing(CAMERA.followRate, dt);
    this.camPos.x += (m.pos.x + lead.x - this.camPos.x) * k;
    this.camPos.y += (m.pos.y + lead.y - this.camPos.y) * k;
    cam.centerOn(this.camPos.x, this.camPos.y);

    this.debugTimer -= deltaMs;
    if (this.debugTimer <= 0) {
      this.debugTimer = 250;
      debugInfo.mech =
        `${scheme} · speed ${m.speed.toFixed(0)}/${this.movement.maxSpeed}` +
        ` · turn ${(m.legTurnVel / DEG).toFixed(0)}°/s`;
    }
  }

  private drawArena(): void {
    const a = TEST_ARENA;
    const c = a.colors;
    const tile = 512;
    bakeGroundTile(this, 'ground-tile', tile, 64, c);
    this.add
      .tileSprite(0, 0, a.width, a.height, 'ground-tile')
      .setOrigin(0, 0)
      .setTileScale(1 / ART_SCALE, 1 / ART_SCALE);

    // Obstacles are static: drawn once into one Graphics object.
    const g = this.add.graphics();
    for (const o of a.obstacles) {
      if (o.kind === 'rect') {
        g.fillStyle(c.building).fillRect(o.x, o.y, o.w, o.h);
        g.lineStyle(3, c.buildingEdge).strokeRect(o.x, o.y, o.w, o.h);
        // Roof detail so buildings read as solid blocks.
        const inset = Math.min(14, o.w / 4, o.h / 4);
        g.lineStyle(1.5, c.buildingEdge, 0.5).strokeRect(o.x + inset, o.y + inset, o.w - inset * 2, o.h - inset * 2);
      } else {
        g.fillStyle(c.rock).fillCircle(o.x, o.y, o.r);
        g.lineStyle(3, c.rockEdge).strokeCircle(o.x, o.y, o.r);
      }
    }
    g.lineStyle(6, c.border).strokeRect(0, 0, a.width, a.height);
  }

  /** Same visible world area on every screen: `viewShortAxis` units on the short side. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    cam.setSize(Viewport.width, Viewport.height);
    cam.setZoom(clamp(Math.min(Viewport.width, Viewport.height) / DISPLAY.viewShortAxis, 0.1, 10));
  }
}
