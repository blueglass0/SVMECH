import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { CAMERA } from '../config/controls';
import { CHASSIS, STARTER_CHASSIS, type ChassisMovement } from '../data/chassis';
import { STARTER_LOADOUT } from '../data/loadouts';
import { DESTROY_TARGETS, MISSION_THEME } from '../data/missions';
import { ACTIVE_COMBAT_DIFFICULTY, COMBAT_DIFFICULTY } from '../data/difficulty';
import { Viewport } from '../core/viewport';
import { InputSystem, actions } from '../core/input';
import { settings } from '../core/settings';
import { CollisionWorld, type Circle, type Obstacle } from '../core/collision';
import { DEG, clamp, smoothing, wrapAngle, type Vec } from '../core/math';
import { randomSeed } from '../core/rng';
import { play } from '../core/audio';
import { DEBUG, debugInfo } from '../core/debug';
import type { Section } from '../data/chassis';
import { DAMAGE_RULES } from '../data/damage';
import { SECTIONS } from '../game/units/SectionDamage';
import { portraitPhone } from '../core/orientation';
import { ART_SCALE, bakeGroundTile } from '../game/art';
import { Combat } from '../game/combat/Combat';
import { Effects } from '../game/combat/Effects';
import type { Unit } from '../game/combat/types';
import { hud } from '../game/hudState';
import { PlayerMech } from '../game/units/PlayerMech';
import { Enemy, Structure, createEnemy, type AiContext } from '../game/units/Enemies';
import { NavGrid } from '../game/world/NavGrid';
import { generateDestroyTargets, type MissionMap } from '../game/world/mapgen';

export interface MissionResult {
  won: boolean;
  seed: number;
  time: number;
  kills: number;
  targetsDestroyed: number;
  targetsTotal: number;
  damageDealt: number;
  damageTaken: number;
  shots: number;
  hits: number;
  ammoUsed: number;
}

/** Live movement numbers: the tuning panel edits this, and it survives mission restarts. */
const liveMovement: ChassisMovement = { ...CHASSIS[STARTER_CHASSIS].movement };

const CHUNK = 800;
const END_DELAY = 1.8;
/** Enemies within this distance of a unit that gets shot join the fight. */
const ALERT_RADIUS = 650;

/** The battlefield: one destroy-targets mission on a generated map. */
export class MapScene extends Phaser.Scene {
  movement: ChassisMovement = liveMovement;
  seed = 0;
  private map!: MissionMap;
  private world!: CollisionWorld;
  private controls!: InputSystem;
  private fx!: Effects;
  private combat!: Combat;
  player!: PlayerMech;
  private enemies: Enemy[] = [];
  private structures: Structure[] = [];
  private dead = new Set<Enemy>();
  private units: Unit[] = [];
  private bodies: Circle[] = [];
  private ai!: AiContext;
  private chunks: { g: Phaser.GameObjects.Graphics; x: number; y: number }[] = [];
  private state: 'active' | 'won' | 'lost' = 'active';
  private endTimer = 0;
  private elapsed = 0;
  private kills = 0;
  private hits = 0;
  private damageDealt = 0;
  private aimWorld: Vec = { x: 0, y: 0 };
  private camPos: Vec = { x: 0, y: 0 };
  private lead: Vec = { x: 0, y: 0 };
  private aimDir: Vec = { x: 0, y: 0 };
  private debugTimer = 0;
  private smokeTimer = 0;
  private tmp: Vec = { x: 0, y: 0 };
  private warnTimer = 0;

  constructor() {
    super('Map');
  }

  init(data: { seed?: number }): void {
    const urlSeed = Number(new URLSearchParams(window.location.search).get('seed'));
    this.seed = data.seed ?? (urlSeed || randomSeed());
    this.state = 'active';
    this.endTimer = this.elapsed = this.kills = this.hits = this.damageDealt = 0;
    this.enemies = [];
    this.structures = [];
    this.dead.clear();
    this.chunks = [];
  }

  create(): void {
    const difficulty = COMBAT_DIFFICULTY[ACTIVE_COMBAT_DIFFICULTY];
    this.map = generateDestroyTargets(this.seed, difficulty);
    const m = this.map;
    this.world = new CollisionWorld(m.width, m.height, m.obstacles);
    const nav = new NavGrid(this.world, 34);
    this.drawMap();

    this.fx = new Effects(this);
    this.player = new PlayerMech(this, STARTER_LOADOUT, this.movement, m.spawn.x, m.spawn.y, m.spawn.angle);
    for (const p of [...m.targets, ...m.turrets, ...m.tanks]) {
      this.enemies.push(createEnemy(this, p.type, p.x, p.y, p.angle, p.home));
    }
    this.structures = this.enemies.filter((e): e is Structure => e instanceof Structure);
    this.units = [this.player, ...this.enemies];
    this.rebuildBodies();
    this.combat = new Combat(this, this.world, this.units, this.fx);
    this.combat.onUnitHit = (u, team, dmg) => this.onUnitHit(u, team, dmg);
    this.ai = { player: this.player, world: this.world, nav, combat: this.combat, fx: this.fx, bodies: this.bodies, difficulty };
    this.controls = new InputSystem(this);

    const cam = this.cameras.main;
    cam.setBackgroundColor(DISPLAY.background);
    cam.setBounds(0, 0, m.width, m.height);
    this.camPos = { x: this.player.x, y: this.player.y };
    this.fitCamera();
    cam.centerOn(this.camPos.x, this.camPos.y);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    });

    const total = m.targets.length;
    hud.state = 'active';
    hud.objectiveLabel = 'Destroy uplinks';
    hud.objectiveTotal = total;
    hud.objectiveDone = 0;
    hud.briefing = DESTROY_TARGETS.briefing(total);
    hud.heatMax = this.player.chassis.heatCapacity;
    hud.ammoMax = this.player.chassis.ammoCapacity.ballistic;
    hud.lastHit = 0;
    hud.hitMarkers.length = 0;
    this.player.onSectionDestroyed = (s) => this.onSectionDestroyed(s);
    if (DEBUG) this.player.view.showHitArcs(this);
    this.buildGroupStatus();
    debugInfo.seed = `seed ${this.seed} · ${m.obstacles.length} obstacles · ${this.enemies.length} enemies`;

    // Started on a phone held upright: wait behind the rotate prompt.
    if (portraitPhone.matches) this.scene.pause();
  }

  /** Release every held input (used when the game is paused, e.g. by the rotate prompt). */
  releaseInput(): void {
    this.controls.reset();
  }

  update(time: number, deltaMs: number): void {
    // Clamp long frames (tab switches, hitches) so nothing jumps.
    const dt = Math.min(deltaMs, 100) / 1000;
    this.controls.update();
    if (this.state === 'active') this.elapsed += dt;

    const cam = this.cameras.main;
    const p = this.player;
    const scheme = settings.scheme[actions.device];
    const aimTarget = this.resolveAim(cam);

    const stepped = p.update(dt, scheme, actions.move, aimTarget, actions.fire1, actions.fire2, this.world, this.bodies, this.combat);
    if (stepped && this.movement.stepShake > 0 && Math.abs(p.motor.speed) > 20) {
      cam.shake(90, this.movement.stepShake, false);
    }

    for (const e of this.enemies) e.update(dt, this.ai);
    for (const s of this.structures) s.pulse(time);
    for (const e of this.enemies) {
      if (!e.alive && !this.dead.has(e)) this.onEnemyDestroyed(e);
    }
    this.combat.listenerX = p.x;
    this.combat.listenerY = p.y;
    this.combat.update(dt);
    this.emitDamageSmoke(dt);
    this.fx.update(dt);
    this.updateMission(dt);
    this.updateCamera(dt, cam);
    this.publishHud(dt, cam);
    this.cullChunks(cam);

    this.debugTimer -= deltaMs;
    if (this.debugTimer <= 0) {
      this.debugTimer = 250;
      debugInfo.mech =
        `${scheme} · speed ${p.motor.speed.toFixed(0)}/${this.movement.maxSpeed}` +
        ` · turn ${(p.motor.legTurnVel / DEG).toFixed(0)}°/s · heat ${p.heat.toFixed(0)}`;
    }
  }

  // --- Dev tools (tuning panel) ---

  devWin(): void {
    for (const s of this.structures) s.takeDamage(1e6, s.x, s.y);
  }

  devSpawnTank(): void {
    const p = this.player;
    const a = p.motor.torsoAngle;
    const e = createEnemy(this, DESTROY_TARGETS.tankType, p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420, a + Math.PI);
    if (this.world.circleBlocked(e.x, e.y, e.radius)) {
      e.x = p.x + Math.cos(a) * 200;
      e.y = p.y + Math.sin(a) * 200;
    }
    this.enemies.push(e);
    this.units.push(e);
    this.rebuildBodies();
  }

  devToggleInvulnerable(): boolean {
    this.player.invulnerable = !this.player.invulnerable;
    return this.player.invulnerable;
  }

  devRefill(): void {
    this.player.refill();
  }

  // --- Internals ---

  /** Turn the aim input into a world point (and the camera lead). */
  private resolveAim(cam: Phaser.Cameras.Scene2D.Camera): Vec | null {
    const p = this.player;
    const lead = this.lead;
    lead.x = lead.y = 0;
    if (actions.aimMode === 'point') {
      const wp = cam.getWorldPoint(actions.aim.x, actions.aim.y);
      this.aimWorld.x = wp.x;
      this.aimWorld.y = wp.y;
      const dx = wp.x - p.x;
      const dy = wp.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const l = Math.min(d * CAMERA.leadFraction, CAMERA.leadMax);
      lead.x = (dx / d) * l;
      lead.y = (dy / d) * l;
      return this.aimWorld;
    }
    if (actions.aimMode === 'direction') {
      this.aimDir.x = actions.aim.x;
      this.aimDir.y = actions.aim.y;
      if (actions.device === 'touch') this.applyAimAssist(this.aimDir);
      this.aimWorld.x = p.x + this.aimDir.x * 1000;
      this.aimWorld.y = p.y + this.aimDir.y * 1000;
      lead.x = actions.aim.x * CAMERA.leadMax * 0.6;
      lead.y = actions.aim.y * CAMERA.leadMax * 0.6;
      return this.aimWorld;
    }
    return null;
  }

  /** Phone only: bend the stick aim halfway toward an enemy close to the aim line. */
  private applyAimAssist(dir: Vec): void {
    const p = this.player;
    const aim = Math.atan2(dir.y, dir.x);
    let best = 12 * DEG;
    let bestDiff = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy > 650 * 650) continue;
      const diff = wrapAngle(Math.atan2(dy, dx) - aim);
      if (Math.abs(diff) < best) {
        best = Math.abs(diff);
        bestDiff = diff;
      }
    }
    if (bestDiff !== 0) {
      const a = aim + bestDiff * 0.5;
      dir.x = Math.cos(a);
      dir.y = Math.sin(a);
    }
  }

  private onUnitHit(u: Unit, team: 'player' | 'enemy', dmg: number): void {
    if (team === 'player') {
      this.hits++;
      this.damageDealt += dmg;
      // Shooting something brings its neighbours.
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.x - u.x, e.y - u.y) < ALERT_RADIUS) e.alert(this.player);
      }
    } else if (u === this.player) {
      hud.lastHit = this.player.lastHit;
      // Direction marker: newest first, capped.
      hud.hitMarkers.unshift({ angle: this.player.lastHitAngle, time: this.player.lastHit });
      if (hud.hitMarkers.length > 6) hud.hitMarkers.length = 6;
      this.cameras.main.shake(110, Math.min(0.006, 0.0015 + dmg * 0.00015), false);
    }
  }

  private onEnemyDestroyed(e: Enemy): void {
    this.dead.add(e);
    e.destroy(this.fx);
    if (!(e instanceof Structure)) {
      this.kills++;
      play('explode', this.combat.volumeAt(e.x, e.y));
    }
    this.rebuildBodies();
  }

  private rebuildBodies(): void {
    this.bodies.length = 0;
    if (this.player?.alive) this.bodies.push(this.player);
    for (const e of this.enemies) if (e.alive) this.bodies.push(e);
  }

  private updateMission(dt: number): void {
    const p = this.player;
    if (this.state === 'active') {
      let done = 0;
      for (const s of this.structures) if (!s.alive) done++;
      hud.objectiveDone = done;
      if (!p.alive) {
        this.state = 'lost';
        this.fx.explosion(p.x, p.y, 1.6);
        play('bigExplode', 1);
        this.rebuildBodies();
      } else if (done === this.structures.length) {
        this.state = 'won';
      }
      // Overheat warning beeps.
      if (p.alive && p.shutdown === 0 && p.heatFraction >= hud.heatWarnAt) {
        this.warnTimer -= dt;
        if (this.warnTimer <= 0) {
          play('warn', 0.8);
          this.warnTimer = 0.5 - p.heatFraction * 0.3;
        }
      }
      return;
    }
    if (this.endTimer < END_DELAY && (this.endTimer += dt) >= END_DELAY) {
      hud.state = this.state;
      this.controls.reset();
      const result: MissionResult = {
        won: this.state === 'won',
        seed: this.seed,
        time: this.elapsed,
        kills: this.kills,
        targetsDestroyed: hud.objectiveDone,
        targetsTotal: hud.objectiveTotal,
        damageDealt: this.damageDealt,
        damageTaken: p.stats.damageTaken,
        shots: p.stats.shots,
        hits: this.hits,
        ammoUsed: p.stats.ammoUsed,
      };
      this.game.events.emit('mission-end', result);
    }
  }

  private updateCamera(dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const p = this.player;
    const k = smoothing(CAMERA.followRate, dt);
    this.camPos.x += (p.x + this.lead.x - this.camPos.x) * k;
    this.camPos.y += (p.y + this.lead.y - this.camPos.y) * k;
    cam.centerOn(this.camPos.x, this.camPos.y);
  }

  /** Weapon group labels and status (rebuilt when an arm, and its weapons, are lost). */
  private buildGroupStatus(): void {
    hud.groups = [1, 2].map((g) => {
      const ws = this.player.weapons.filter((w) => w.group === g);
      const live = ws.filter((w) => !w.destroyed);
      return {
        label: live.length > 0 ? live.map((w) => w.def.short).join(' + ') : ws.length > 0 ? 'DESTROYED' : '—',
        ready: 1,
        empty: false,
        usesAmmo: live.some((w) => w.def.ammoPerShot > 0),
      };
    });
  }

  private onSectionDestroyed(s: Section): void {
    const p = this.player;
    if (s === 'leftArm' || s === 'rightArm') {
      p.view.armPosition(s, this.tmp);
      this.fx.explosion(this.tmp.x, this.tmp.y, 0.7);
      play('explode', 1);
      this.buildGroupStatus();
    } else if (s === 'legs') {
      this.fx.explosion(p.x, p.y, 0.5);
      play('explode', 0.8);
    }
  }

  /** Damaged sections smoke, so you can see the state of your mech in the world too. */
  private emitDamageSmoke(dt: number): void {
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = 0.18;
    const p = this.player;
    if (!p.alive) return;
    const sec = p.sections;
    for (const s of SECTIONS) {
      if (sec.frac(s) >= DAMAGE_RULES.smokeBelow || Math.random() < 0.5) continue;
      if (s === 'leftArm' || s === 'rightArm') p.view.armPosition(s, this.tmp);
      else {
        this.tmp.x = p.x;
        this.tmp.y = p.y;
      }
      this.fx.puff(this.tmp.x, this.tmp.y, sec.destroyed(s));
    }
  }

  devDamageSection(s: Section): void {
    this.player.damageSection(s, 60);
  }

  private publishHud(_dt: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const p = this.player;
    for (const s of SECTIONS) {
      hud.sections[s] = p.sections.frac(s);
      hud.sectionHitAt[s] = p.sections.hitAt[s];
    }
    hud.playerX = p.x;
    hud.playerY = p.y;
    hud.heat = p.heat;
    hud.shutdown = p.shutdown;
    hud.ammo = p.ammo.ballistic;
    for (let g = 0; g < 2; g++) {
      const ws = p.weapons.filter((w) => w.group === g + 1 && !w.destroyed);
      const status = hud.groups[g];
      if (!status) continue;
      if (ws.length === 0) {
        status.ready = 0;
        status.empty = true;
        continue;
      }
      status.ready = Math.min(...ws.map((w) => 1 - w.cooldown * w.def.fireRate));
      status.empty = ws.every((w) => w.def.ammoPerShot > 0 && p.ammo.ballistic < w.def.ammoPerShot);
    }
    const v = cam.worldView;
    hud.cam.x = v.x;
    hud.cam.y = v.y;
    hud.cam.w = v.width;
    hud.cam.h = v.height;
    hud.targets.length = 0;
    hud.threats.length = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e instanceof Structure) hud.targets.push(e);
      else if (e.engaged && Math.hypot(e.x - p.x, e.y - p.y) < 1100) hud.threats.push(e);
    }
    if (this.elapsed > 4.5) hud.briefing = '';
  }

  private drawMap(): void {
    const m = this.map;
    const c = MISSION_THEME;
    bakeGroundTile(this, 'ground-tile', 512, 64, c);
    this.add
      .tileSprite(0, 0, m.width, m.height, 'ground-tile')
      .setOrigin(0, 0)
      .setTileScale(1 / ART_SCALE, 1 / ART_SCALE)
      .setDepth(0);

    // Obstacles are drawn once, into one Graphics per map chunk; off-screen chunks are hidden.
    const cols = Math.ceil(m.width / CHUNK);
    const rows = Math.ceil(m.height / CHUNK);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        this.chunks.push({ g: this.add.graphics().setDepth(1), x: col * CHUNK, y: r * CHUNK });
      }
    }
    for (const o of m.obstacles) {
      const cx = o.kind === 'rect' ? o.x + o.w / 2 : o.x;
      const cy = o.kind === 'rect' ? o.y + o.h / 2 : o.y;
      const chunk = this.chunks[Math.min(rows - 1, Math.floor(cy / CHUNK)) * cols + Math.min(cols - 1, Math.floor(cx / CHUNK))];
      drawObstacle(chunk.g, o);
    }
    this.add.graphics().setDepth(1).lineStyle(6, c.border).strokeRect(0, 0, m.width, m.height);
  }

  private cullChunks(cam: Phaser.Cameras.Scene2D.Camera): void {
    const v = cam.worldView;
    // Long walls can reach well outside their chunk, hence the margin.
    const margin = 400;
    for (const ch of this.chunks) {
      ch.g.setVisible(
        ch.x - margin < v.right && ch.x + CHUNK + margin > v.x && ch.y - margin < v.bottom && ch.y + CHUNK + margin > v.y,
      );
    }
  }

  /** Same visible world area on every screen: `viewShortAxis` units on the short side. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    cam.setSize(Viewport.width, Viewport.height);
    const small = Math.min(Viewport.cssWidth, Viewport.cssHeight) < DISPLAY.smallScreenCss;
    const view = small ? DISPLAY.viewShortAxisSmall : DISPLAY.viewShortAxis;
    cam.setZoom(clamp(Math.min(Viewport.width, Viewport.height) / view, 0.1, 10));
  }
}

function drawObstacle(g: Phaser.GameObjects.Graphics, o: Obstacle): void {
  const c = MISSION_THEME;
  if (o.kind === 'circle') {
    g.fillStyle(c.rock).fillCircle(o.x, o.y, o.r);
    g.lineStyle(3, c.rockEdge).strokeCircle(o.x, o.y, o.r);
    return;
  }
  const thin = Math.min(o.w, o.h) < 60;
  g.fillStyle(thin ? c.wall : c.building).fillRect(o.x, o.y, o.w, o.h);
  g.lineStyle(3, thin ? c.wallEdge : c.buildingEdge).strokeRect(o.x, o.y, o.w, o.h);
  if (!thin) {
    // Roof detail so buildings read as solid blocks.
    const inset = Math.min(14, o.w / 4, o.h / 4);
    g.lineStyle(1.5, c.buildingEdge, 0.5).strokeRect(o.x + inset, o.y + inset, o.w - inset * 2, o.h - inset * 2);
  }
}
