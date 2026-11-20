import Phaser from 'phaser';
import { DISPLAY } from '../config/display';
import { CAMERA } from '../config/controls';
import { CHASSIS, STARTER_CHASSIS, type ChassisMovement } from '../data/chassis';
import { DESTROY_TARGETS, MISSION_THEME } from '../data/missions';
import { Viewport } from '../core/viewport';
import { InputSystem, actions, touchButtons } from '../core/input';
import { settings } from '../core/settings';
import { CollisionWorld, type Circle } from '../core/collision';
import { DEG, clamp, smoothing, wrapAngle, type Vec } from '../core/math';
import { randomSeed } from '../core/rng';
import { play } from '../core/audio';
import { DEBUG, debugInfo } from '../core/debug';
import type { Section } from '../data/chassis';
import { DAMAGE_RULES } from '../data/damage';
import { ENEMIES } from '../data/enemies';
import { FACTIONS } from '../data/factions';
import { SECTIONS } from '../game/units/SectionDamage';
import { portraitPhone } from '../core/orientation';
import { ART_SCALE, bakeGroundTile } from '../game/art';
import { Combat } from '../game/combat/Combat';
import { Effects } from '../game/combat/Effects';
import type { Unit } from '../game/combat/types';
import { hud } from '../game/hudState';
import { Mech } from '../game/units/Mech';
import { Enemy, Structure, Tank, Turret, createEnemy, type AiContext } from '../game/units/Enemies';
import { NavGrid } from '../game/world/NavGrid';
import { FogOverlay } from '../game/world/Fog';
import { drawTerrain, terrainStage } from '../game/world/terrainArt';
import { STATION_RADIUS, generateDestroyTargets, type MissionMap, type StationType } from '../game/world/mapgen';
import type { MechState, MissionConfig, MissionOutcome } from '../career/types';
import { newCareer } from '../career/career';

/** Mission config for quick dev runs without a career (?quick). */
function quickConfig(seed: number): MissionConfig {
  const c = newCareer('normal', 'normal');
  return {
    contract: { ...c.contracts[0], seed },
    mech: c.mechs[0],
    backups: [],
    funds: c.money,
    fieldPrices: { repairPerArmor: 80, ammoBallistic: 12, ammoMissile: 60, swapFee: 8000 },
    enemyCount: 1,
    enemySpread: 1,
    enemyDamage: 1,
  };
}

/** Live movement numbers: the tuning panel edits this, and it survives mission restarts. */
const liveMovement: ChassisMovement = { ...CHASSIS[STARTER_CHASSIS].movement };

const CHUNK = 800;
const END_DELAY = 1.8;
/** Seconds between a mech's destruction and its backup landing. */
const BACKUP_DROP_DELAY = 2.2;
/** Reach within this distance of the evac point to finish. */
const EVAC_RADIUS = 80;
/** The evac zone opens at least this far from where the mech is. */
const EVAC_MIN_DISTANCE = 650;
/** Enemies within this distance of a unit that gets shot join the fight. */
const ALERT_RADIUS = 650;

/** The battlefield: one destroy-targets mission on a generated map. */
export class MapScene extends Phaser.Scene {
  movement: ChassisMovement = liveMovement;
  seed = 0;
  private config!: MissionConfig;
  private withdrew = false;
  private map!: MissionMap;
  private world!: CollisionWorld;
  private controls!: InputSystem;
  private fx!: Effects;
  private combat!: Combat;
  player!: Mech;
  private enemies: Enemy[] = [];
  private structures: Structure[] = [];
  private dead = new Set<Enemy>();
  private units: Unit[] = [];
  private bodies: Circle[] = [];
  private ai!: AiContext;
  private chunks: { g: Phaser.GameObjects.Graphics; x: number; y: number; items: number[] }[] = [];
  /** Per obstacle: its chunk and its drawn damage stage (redraw when it changes). */
  private obstacleChunk: number[] = [];
  private obstacleStage: number[] = [];
  private nav!: NavGrid;
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
  private evac: Vec | null = null;
  /** Every mech fielded this mission (first = the one deployed), and backups still waiting. */
  private deployed: Mech[] = [];
  private backupQueue: MechState[] = [];
  /** Seconds until the next backup lands (0 = none dropping). */
  private dropTimer = 0;
  private sectionLost = false;
  private stations: Station[] = [];
  private fieldCosts: { label: string; amount: number }[] = [];
  private funds = 0;
  private prevInteract = false;
  private fog?: FogOverlay;
  private visionTimer = 0;
  /** Dev toggle: fog of war off shows every enemy. */
  fogEnabled = !new URLSearchParams(window.location.search).has('nofog');
  private evacImg?: Phaser.GameObjects.Image;
  private briefingUntil = 4.5;
  private lockTarget: Enemy | null = null;
  private lockImg!: Phaser.GameObjects.Image;

  constructor() {
    super('Map');
  }

  init(data: Partial<MissionConfig>): void {
    const urlSeed = Number(new URLSearchParams(window.location.search).get('seed'));
    this.config = data.contract ? (data as MissionConfig) : quickConfig(urlSeed || randomSeed());
    this.seed = this.config.contract.seed;
    this.withdrew = false;
    this.fog = undefined;
    this.evac = null;
    this.evacImg = undefined;
    this.briefingUntil = 4.5;
    this.state = 'active';
    this.endTimer = this.elapsed = this.kills = this.hits = this.damageDealt = 0;
    this.enemies = [];
    this.structures = [];
    this.dead.clear();
    this.chunks = [];
  }

  create(): void {
    const cfg = this.config;
    const difficulty = { enemyCount: cfg.enemyCount, enemySpread: cfg.enemySpread, enemyDamage: cfg.enemyDamage };
    const army = cfg.contract.enemyFaction ? FACTIONS[cfg.contract.enemyFaction].army : null;
    this.armySkin = army?.skin ?? '';
    const forces = {
      mechs: cfg.contract.enemyMechs ?? [],
      droneFlights: cfg.contract.droneFlights ?? 0,
      tankTypes: army?.tankTypes,
      turretTypes: army?.turretTypes,
    };
    this.map = generateDestroyTargets(this.seed, difficulty, cfg.contract.targets, forces);
    const m = this.map;
    this.world = new CollisionWorld(m.width, m.height, m.obstacles);
    // Tanks crush props, so props don't block their paths.
    const nav = (this.nav = new NavGrid(this.world, 34, TANK_CRUSH));
    this.world.onChange = (i, destroyed, crushed) => this.onTerrainChanged(i, destroyed, crushed);
    this.drawMap();

    this.fx = new Effects(this);
    this.player = new Mech(this, cfg.mech, this.movement, m.spawn.x, m.spawn.y, m.spawn.angle);
    this.deployed = [this.player];
    this.backupQueue = [...cfg.backups];
    this.dropTimer = 0;
    this.sectionLost = false;
    this.funds = cfg.funds;
    this.fieldCosts = [];
    this.prevInteract = false;
    this.stations = m.stations.map((st) => ({
      ...st,
      used: false,
      img: this.add.image(st.x, st.y, `station-${st.type}`).setScale(1 / ART_SCALE).setDepth(1.5),
    }));
    for (const p of [...m.targets, ...m.turrets, ...m.tanks, ...m.units]) {
      this.enemies.push(createEnemy(this, p.type, p.x, p.y, p.angle, p.home, this.armySkin));
    }
    this.structures = this.enemies.filter((e): e is Structure => e instanceof Structure);
    this.units = [this.player, ...this.enemies];
    this.rebuildBodies();
    this.combat = new Combat(this, this.world, this.units, this.fx);
    this.combat.onUnitHit = (u, team, dmg, counts) => this.onUnitHit(u, team, dmg, counts);
    this.ai = { player: this.player, world: this.world, nav, combat: this.combat, fx: this.fx, bodies: this.bodies, difficulty };
    this.controls = new InputSystem(this);
    this.visionTimer = 0;
    this.lockImg = this.add.image(0, 0, 'lock').setScale(1 / ART_SCALE).setDepth(12).setVisible(false);
    this.lockTarget = null;

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
    hud.bonusLabel = cfg.contract.bonus.label;
    hud.bonusState = 'open';
    hud.lastHit = 0;
    hud.hitMarkers.length = 0;
    hud.backups = this.backupQueue.length;
    this.attachPlayer();
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

    const lock = this.updateLock();
    const stepped = p.update(
      dt,
      {
        scheme,
        move: actions.move,
        aimTarget,
        fire1: actions.fire1,
        fire2: actions.fire2,
        equip1: actions.equip1,
        equip2: actions.equip2,
        lock,
      },
      this.world,
      this.bodies,
      this.combat,
    );
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
    this.updateStations();
    this.updateVision(dt);
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

  /**
   * Fog of war: an enemy is visible inside the vision cone (in range, with line
   * of sight) or within the close all-round radius; radar shows blips through
   * walls. Checked 10 times a second; the overlay follows the torso every frame.
   */
  private updateVision(dt: number): void {
    const p = this.player;
    const v = p.loadout.vision;
    const alpha = !this.fogEnabled ? 0 : settings.fog === 'dark' ? 0.93 : 0.62;
    this.fog?.update(p.x, p.y, p.motor.torsoAngle, p.alive ? alpha : 0);
    this.visionTimer -= dt;
    if (this.visionTimer > 0) return;
    this.visionTimer = 0.1;
    const cone = v.coneDeg * DEG;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!this.fogEnabled || !p.alive) {
        e.setDetection('visible', this.elapsed);
        continue;
      }
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      let seen = d <= v.radius + e.radius;
      if (!seen && d <= v.range + e.radius) {
        // Count the unit as in the cone if any part of it is (its angular size at this distance).
        const edge = Math.asin(Math.min(1, e.radius / Math.max(d, 1)));
        const off = Math.abs(wrapAngle(Math.atan2(dy, dx) - p.motor.torsoAngle));
        seen = off <= cone + edge && this.world.lineOfSight(p.x, p.y, e.x, e.y);
      }
      const radar = !seen && v.radar > 0 && d <= v.radar;
      e.setDetection(seen ? 'visible' : radar ? 'radar' : 'hidden', this.elapsed);
    }
  }

  /**
   * Seeking missiles lock onto the enemy closest to the torso's aim line
   * (within 20° and missile range). Shown with a reticle.
   */
  private updateLock(): Enemy | null {
    const p = this.player;
    const seeker = p.weapons.find((w) => !w.destroyed && w.def.missile && w.def.missile.turnRate > 0);
    let best: Enemy | null = null;
    if (seeker && p.alive) {
      let bestDiff = 20 * DEG;
      const range = seeker.def.range;
      for (const e of this.enemies) {
        if (!e.alive || e.detection !== 'visible') continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy > range * range) continue;
        const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - p.motor.torsoAngle));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = e;
        }
      }
    }
    if (best && best !== this.lockTarget) play('lock', 0.7);
    this.lockTarget = best;
    this.lockImg.setVisible(!!best);
    if (best) this.lockImg.setPosition(best.x, best.y).setRotation(this.elapsed * 1.5);
    return best;
  }

  /** Objectives done: open an evac zone a good walk away, preferably away from enemies. */
  private openEvac(): void {
    const p = this.player;
    let best: Vec | null = null;
    let bestScore = -Infinity;
    // Rings from EVAC_MIN_DISTANCE outward; points off the map or in obstacles are skipped.
    for (let ring = 0; ring < 5; ring++) {
      const d = EVAC_MIN_DISTANCE + ring * 150;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2 + ring * 0.1;
        const x = p.x + Math.cos(a) * d;
        const y = p.y + Math.sin(a) * d;
        if (this.world.circleBlocked(x, y, EVAC_RADIUS)) continue;
        let nearest = 2000;
        for (const e of this.enemies) if (e.alive) nearest = Math.min(nearest, Math.hypot(e.x - x, e.y - y));
        // Prefer away from enemies, and not much further than needed.
        const score = nearest - ring * 60;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    // Practically never needed: the drop point is always clear.
    this.evac = best ?? { x: this.map.spawn.x, y: this.map.spawn.y };
    this.evacImg = this.add.image(this.evac.x, this.evac.y, 'evac').setScale(1 / ART_SCALE).setDepth(2);
    hud.objectiveLabel = 'Reach the evac zone';
    hud.objectiveTotal = 0;
    hud.briefing = 'Uplinks down. Get to the evac zone.';
    this.briefingUntil = this.elapsed + 4;
    play('ui', 1);
  }

  /** Leave the battlefield: the mission fails but the mech comes home as it is. */
  withdraw(): void {
    if (this.state !== 'active') return;
    this.withdrew = true;
    this.state = 'lost';
    this.endTimer = END_DELAY - 0.01;
  }

  /** Progress on the contract's bonus objective. */
  private bonusState(): 'open' | 'done' | 'failed' {
    const b = this.config.contract.bonus;
    const p = this.player;
    switch (b.kind) {
      case 'turrets':
        return this.enemies.some((e) => e instanceof Turret && e.alive) ? 'open' : 'done';
      case 'tanks':
        return this.enemies.some((e) => e instanceof Tank && e.alive) ? 'open' : 'done';
      case 'fast':
        if (this.elapsed > (b.seconds ?? 0)) return 'failed';
        return this.state === 'won' ? 'done' : 'open';
      case 'intact':
        if (this.sectionLost || SECTIONS.some((sec) => p.sections.destroyed(sec))) return 'failed';
        return this.state === 'won' ? 'done' : 'open';
    }
  }

  // --- Dev tools (tuning panel) ---

  /** Dev: destroy every target; pressed again once evac is open, finishes the mission. */
  devWin(): void {
    if (this.evac && this.state === 'active') {
      this.state = 'won';
      return;
    }
    for (const s of this.structures) s.takeDamage(1e6, s.x, s.y);
  }

  /** Dev: spawn an enemy ahead of the player (tanks, drones, enemy mechs: any EnemyDef id). */
  devSpawnTank(type: string = DESTROY_TARGETS.tankType, distance = 420): Enemy {
    const p = this.player;
    const a = p.motor.torsoAngle;
    const e = createEnemy(this, type, p.x + Math.cos(a) * distance, p.y + Math.sin(a) * distance, a + Math.PI, undefined, this.armySkin);
    if (!e.flying && this.world.circleBlocked(e.x, e.y, e.radius)) e.place(p.x + Math.cos(a) * 200, p.y + Math.sin(a) * 200);
    this.enemies.push(e);
    this.units.push(e);
    this.rebuildBodies();
    return e;
  }

  devSpawnDrones(): void {
    for (let i = 0; i < 3; i++) this.devSpawnTank('drone', 500 + i * 40);
  }

  /** Dev: spawn the next enemy mech type in turn. */
  devSpawnMech(): string {
    const types = Object.values(ENEMIES).filter((d) => d.kind === 'mech');
    const def = types[this.devMechIndex++ % types.length];
    this.devSpawnTank(def.id, 520);
    return def.name;
  }
  private devMechIndex = 0;
  /** The enemy army's colours for this mission. */
  private armySkin = '';

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
      if (!e.alive || e.detection !== 'visible') continue;
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

  private onUnitHit(u: Unit, team: 'player' | 'enemy', dmg: number, counts: boolean): void {
    if (team === 'player') {
      if (counts) this.hits++;
      this.damageDealt += dmg;
      // Shooting something brings its neighbours.
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.x - u.x, e.y - u.y) < ALERT_RADIUS) e.alert(this.player);
      }
    } else if (u === this.player && (counts || dmg >= 2)) {
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
    for (const e of this.enemies) if (e.alive && !e.flying) this.bodies.push(e);
  }

  private updateMission(dt: number): void {
    const p = this.player;
    if (this.state === 'active') {
      let done = 0;
      for (const s of this.structures) if (!s.alive) done++;
      hud.objectiveDone = done;
      if (!p.alive) {
        if (this.dropTimer === 0) {
          // Just destroyed: explode, then drop the next backup or fail.
          this.fx.explosion(p.x, p.y, 1.6);
          play('bigExplode', 1);
          this.rebuildBodies();
          if (this.backupQueue.length > 0) {
            this.dropTimer = BACKUP_DROP_DELAY;
            hud.briefing = `${CHASSIS[p.chassis.id].name} lost. Backup dropping in.`;
            this.briefingUntil = this.elapsed + 3;
          } else {
            this.state = 'lost';
          }
        } else if ((this.dropTimer -= dt) <= 0) {
          this.dropBackup();
        }
      } else if (done === this.structures.length && !this.evac) {
        this.openEvac();
      } else if (this.evac && Math.hypot(p.x - this.evac.x, p.y - this.evac.y) < EVAC_RADIUS) {
        this.state = 'won';
        play('ui', 1);
      }
      // Warning beeps: overheating, or missiles homing in.
      const hot = p.alive && p.shutdown === 0 && p.heatFraction >= hud.heatWarnAt;
      if (hot || hud.missileWarning) {
        this.warnTimer -= dt;
        if (this.warnTimer <= 0) {
          play('warn', 0.8);
          this.warnTimer = hud.missileWarning ? 0.22 : 0.5 - p.heatFraction * 0.3;
        }
      }
      return;
    }
    if (this.endTimer < END_DELAY && (this.endTimer += dt) >= END_DELAY) {
      hud.state = this.state;
      this.controls.reset();
      const sum = (f: (m: Mech) => number) => this.deployed.reduce((t, m) => t + f(m), 0);
      const outcome: MissionOutcome = {
        won: this.state === 'won',
        withdrew: this.withdrew,
        bonusAchieved: this.state === 'won' && this.bonusState() === 'done',
        time: this.elapsed,
        kills: this.kills,
        targetsDestroyed: this.structures.filter((t) => !t.alive).length,
        targetsTotal: this.structures.length,
        damageDealt: this.damageDealt,
        damageTaken: sum((m) => m.stats.damageTaken),
        shots: sum((m) => m.stats.shots),
        hits: this.hits,
        ammoUsed: sum((m) => m.stats.ammoUsed),
        mechs: [...this.deployed.map((m) => m.toState()), ...this.backupQueue],
        backupsUsed: this.deployed.length - 1,
        fieldCosts: this.fieldCosts,
      };
      this.game.events.emit('mission-end', outcome);
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
        usesAmmo: live.some((w) => w.def.ammoPerShot > 0 && w.def.family !== 'missile'),
        usesMissiles: live.some((w) => w.def.ammoPerShot > 0 && w.def.family === 'missile'),
      };
    });
  }

  /** What the station the mech is standing on offers right now (cost, or why not). */
  private stationOffer(st: Station): { label: string; cost: number; reason: string } {
    const p = this.player;
    const P = this.config.fieldPrices;
    if (st.used) return { label: 'Station', cost: 0, reason: 'already used' };
    if (st.type === 'ammo') {
      const cap = p.loadout.ammoCapacity;
      const cost = Math.round((cap.ballistic - p.ammo.ballistic) * P.ammoBallistic + (cap.missile - p.ammo.missile) * P.ammoMissile);
      return { label: 'Resupply ammo', cost, reason: cost === 0 ? 'Ammo is full' : '' };
    }
    if (st.type === 'repair') {
      let missing = 0;
      for (const sec of SECTIONS) if (!p.sections.destroyed(sec)) missing += p.sections.max[sec] - p.sections.hp[sec];
      const cost = Math.round(missing * P.repairPerArmor);
      return { label: 'Patch armor', cost, reason: cost === 0 ? 'Nothing to patch (destroyed sections need the hangar)' : '' };
    }
    const next = this.backupQueue[0];
    if (!next) return { label: 'Swap mech', cost: P.swapFee, reason: 'No backup on the ship' };
    return { label: `Swap for backup ${CHASSIS[next.chassis].name}`, cost: P.swapFee, reason: '' };
  }

  /** Field stations: show what's on offer while standing on one, and use it on interact. */
  private updateStations(): void {
    const p = this.player;
    const st = p.alive ? this.stations.find((x) => Math.hypot(x.x - p.x, x.y - p.y) < STATION_RADIUS) : undefined;
    const pressed = actions.interact && !this.prevInteract;
    this.prevInteract = actions.interact;
    touchButtons.interact.visible = !!st && this.state === 'active';
    if (!st) {
      hud.interactPrompt = '';
      return;
    }
    const offer = this.stationOffer(st);
    const left = this.funds - this.fieldCosts.reduce((t, f) => t + f.amount, 0);
    const reason = offer.reason || (offer.cost > left ? `Not enough money (${moneyText(left)} left)` : '');
    hud.interactPrompt = reason ? `${offer.label}: ${reason}` : `${offer.label}  ${moneyText(offer.cost)}`;
    hud.interactReady = !reason;
    if (!pressed || reason || this.state !== 'active') return;
    this.fieldCosts.push({ label: `Field: ${offer.label}`, amount: offer.cost });
    st.used = true;
    st.img.setTexture('station-used');
    play('ui', 1);
    if (st.type === 'ammo') {
      p.ammo = { ...p.loadout.ammoCapacity };
    } else if (st.type === 'repair') {
      for (const sec of SECTIONS) if (!p.sections.destroyed(sec)) p.sections.hp[sec] = p.sections.max[sec];
      p.updateLegs();
    } else {
      this.swapToBackup(st);
    }
    this.fx.flareBurst(st.x, st.y);
  }

  /** Swap station: the current mech is airlifted home as it is; the backup lands on the pad. */
  private swapToBackup(st: Station): void {
    const state = this.backupQueue.shift();
    if (!state) return;
    const old = this.player;
    old.airlift();
    this.player = new Mech(this, state, this.movement, st.x, st.y, old.motor.torsoAngle);
    this.deployed.push(this.player);
    this.units[this.units.indexOf(old)] = this.player;
    this.rebuildBodies();
    this.attachPlayer();
    hud.backups = this.backupQueue.length;
    this.fx.explosion(st.x, st.y, 1);
    play('collapse', 0.8);
    hud.briefing = `${CHASSIS[old.chassis.id].name} airlifted out. ${CHASSIS[state.chassis].name} deployed.`;
    this.briefingUntil = this.elapsed + 3;
  }

  /** Hook up everything that follows the player's mech (start of mission, and each backup drop). */
  private attachPlayer(): void {
    const p = this.player;
    this.ai.player = p;
    hud.heatMax = p.loadout.heatCapacity;
    hud.ammoMax = p.loadout.ammoCapacity.ballistic;
    p.onSectionDestroyed = (s) => this.onSectionDestroyed(s);
    if (DEBUG) p.view.showHitArcs(this);
    // Phone equipment buttons only appear for fitted, activated equipment.
    touchButtons.equip1.visible = p.loadout.actions.length >= 1;
    touchButtons.equip2.visible = p.loadout.actions.length >= 2;
    this.fog?.destroy();
    this.fog = new FogOverlay(this, p.loadout.vision);
    this.buildGroupStatus();
  }

  /** Drop the next backup at a clear spot near where the last mech fell, away from enemies. */
  private dropBackup(): void {
    const state = this.backupQueue.shift();
    if (!state) return;
    const old = this.player;
    const r = CHASSIS[state.chassis].radius + 10;
    let best = { x: this.map.spawn.x, y: this.map.spawn.y };
    let bestScore = -Infinity;
    for (let ring = 0; ring < 5; ring++) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + ring;
        const d = 120 + ring * 110;
        const x = old.x + Math.cos(a) * d;
        const y = old.y + Math.sin(a) * d;
        if (this.world.circleBlocked(x, y, r) || this.bodies.some((b) => Math.hypot(b.x - x, b.y - y) < b.radius + r)) continue;
        let nearest = 1500;
        for (const e of this.enemies) if (e.alive) nearest = Math.min(nearest, Math.hypot(e.x - x, e.y - y));
        const score = Math.min(nearest, 700) - d * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    this.dropTimer = 0;
    this.player = new Mech(this, state, this.movement, best.x, best.y, old.motor.torsoAngle);
    this.deployed.push(this.player);
    this.units[this.units.indexOf(old)] = this.player;
    this.rebuildBodies();
    this.attachPlayer();
    hud.backups = this.backupQueue.length;
    // Landing: flash, dust and a heavy thud.
    this.fx.explosion(best.x, best.y, 1.2);
    play('collapse', 1);
    this.cameras.main.shake(250, 0.006, false);
    hud.briefing = `Backup ${CHASSIS[state.chassis].name} deployed.`;
    this.briefingUntil = this.elapsed + 3;
  }

  private onSectionDestroyed(s: Section): void {
    this.sectionLost = true;
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
    hud.ammoMissile = p.ammo.missile;
    hud.missileWarning = p.alive && this.combat.missiles.incoming(p) > 0;
    const e = p.equip;
    const L = p.loadout;
    hud.equipment = L.actions.map((kind) =>
      kind === 'flares'
        ? { label: `FLARES ×${e.flares}`, ready: e.flares > 0 && e.flareCooldown === 0, active: false }
        : {
            label: e.shieldUp > 0 ? `SHIELD ${Math.ceil(e.shieldPool)}` : e.shieldCooldown > 0 ? `SHIELD ${Math.ceil(e.shieldCooldown)}s` : 'SHIELD',
            ready: e.shieldCooldown === 0,
            active: e.shieldUp > 0,
          },
    );
    for (let g = 0; g < 2; g++) {
      const ws = p.weapons.filter((w) => w.group === g + 1 && !w.destroyed);
      const status = hud.groups[g];
      if (!status) continue;
      if (ws.length === 0) {
        status.ready = 0;
        status.empty = true;
        continue;
      }
      status.ready = Math.max(0, Math.min(...ws.map((w) => (w.def.delivery === 'stream' ? 1 : 1 - w.cooldown * w.def.fireRate))));
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
      // Threat arrows only for enemies you know about: detected now, or seen in the last few seconds.
      else if (e.engaged && Math.hypot(e.x - p.x, e.y - p.y) < 1100 && (e.detection !== 'hidden' || this.elapsed - e.lastSeenAt < 3)) {
        hud.threats.push(e);
      }
    }
    if (this.elapsed > this.briefingUntil) hud.briefing = '';
    if (this.evac) hud.targets.push(this.evac);
    hud.stations.length = 0;
    for (const st of this.stations) if (!st.used) hud.stations.push(st);
    this.evacImg?.setRotation(this.elapsed * 0.6);
    hud.bonusState = this.bonusState();
    if (this.config.contract.bonus.kind === 'fast' && hud.bonusState === 'open') {
      const left = Math.max(0, (this.config.contract.bonus.seconds ?? 0) - this.elapsed);
      hud.bonusLabel = `Finish within ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    }
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

    // Obstacles are drawn into one Graphics per map chunk; off-screen chunks are hidden.
    // A chunk is redrawn only when one of its obstacles changes damage stage.
    const cols = Math.ceil(m.width / CHUNK);
    const rows = Math.ceil(m.height / CHUNK);
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        this.chunks.push({ g: this.add.graphics().setDepth(1), x: col * CHUNK, y: r * CHUNK, items: [] });
      }
    }
    this.obstacleChunk = [];
    this.obstacleStage = [];
    m.obstacles.forEach((o, i) => {
      const cx = o.kind === 'rect' ? o.x + o.w / 2 : o.x;
      const cy = o.kind === 'rect' ? o.y + o.h / 2 : o.y;
      const ci = Math.min(rows - 1, Math.floor(cy / CHUNK)) * cols + Math.min(cols - 1, Math.floor(cx / CHUNK));
      this.chunks[ci].items.push(i);
      this.obstacleChunk.push(ci);
      this.obstacleStage.push(0);
    });
    for (let ci = 0; ci < this.chunks.length; ci++) this.drawChunk(ci);
    this.add.graphics().setDepth(1).lineStyle(6, c.border).strokeRect(0, 0, m.width, m.height);
  }

  private drawChunk(ci: number): void {
    const ch = this.chunks[ci];
    ch.g.clear();
    // Rubble first, so standing obstacles draw over it.
    for (const rubble of [true, false]) {
      for (const i of ch.items) {
        if (this.obstacleStage[i] >= 3 !== rubble) continue;
        drawTerrain(ch.g, this.map.obstacles[i], this.world.terrain[i], this.obstacleStage[i], i + this.seed);
      }
    }
  }

  /** Terrain took damage, collapsed or was crushed. */
  private onTerrainChanged(i: number, destroyed: boolean, crushed: boolean): void {
    const w = this.world;
    const stage = terrainStage(w.hp[i], w.terrain[i].hp, !destroyed);
    if (stage !== this.obstacleStage[i]) {
      this.obstacleStage[i] = stage;
      this.drawChunk(this.obstacleChunk[i]);
    }
    if (!destroyed) return;
    const o = this.map.obstacles[i];
    const [x0, y0, x1, y1] = o.kind === 'rect' ? [o.x, o.y, o.x + o.w, o.y + o.h] : [o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r];
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const size = Math.max(x1 - x0, y1 - y0);
    if (crushed) {
      this.fx.impact(cx, cy, Math.random() * Math.PI * 2, 4);
      play('crunch', this.combat.volumeAt(cx, cy));
    } else {
      // Collapse: dust and debris scaled to the size of what fell.
      this.fx.explosion(cx, cy, Math.min(2, 0.4 + size / 200));
      for (let k = 0; k < Math.min(5, size / 60); k++) {
        this.fx.puff(x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0), true);
      }
      play(size > 90 ? 'collapse' : 'crunch', this.combat.volumeAt(cx, cy));
    }
    // Paths open up where solid terrain fell (props never blocked tanks).
    if (w.terrain[i].crush > TANK_CRUSH) this.nav.refresh(x0, y0, x1, y1);
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

interface Station {
  type: StationType;
  x: number;
  y: number;
  used: boolean;
  img: Phaser.GameObjects.Image;
}

function moneyText(n: number): string {
  return `¢${Math.max(0, Math.round(n)).toLocaleString('en-US')}`;
}

/** Tanks crush terrain up to this tonnage (keep in line with `crushTonnage` in data/enemies.ts). */
const TANK_CRUSH = 35;
