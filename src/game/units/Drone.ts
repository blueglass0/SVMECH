import Phaser from 'phaser';
import type { Vec } from '../../core/math';
import type { EnemyDef } from '../../data/enemies';
import { ART_SCALE } from '../art';
import type { Effects } from '../combat/Effects';
import { GIVE_UP_AFTER, Gunner, type AiContext } from './Enemy';

/** Where the shadow falls, as if lit from the top left. */
const SHADOW_X = 10;
const SHADOW_Y = 14;

/**
 * Attack drone: small, fast and fragile. Flies over terrain and units, circles
 * the player at a distance while shooting, and comes in groups. Its shots are
 * ordinary projectiles, so buildings still block them.
 */
export class Drone extends Gunner {
  private vx = 0;
  private vy = 0;
  private orbit = Math.random() * Math.PI * 2;
  private orbitDir = Math.random() < 0.5 ? 1 : -1;
  private orbitRange: number;
  private orbitTimer = 3 + Math.random() * 4;
  private wander: Vec;
  private wanderTimer = 0;
  private bob = Math.random() * 10;
  private img: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    def: EnemyDef,
    x: number,
    y: number,
    angle: number,
    private home: Vec,
    skin = '',
  ) {
    super(scene, def, x, y, angle);
    this.flying = true;
    this.orbitRange = (def.orbitRange ?? 250) * (0.8 + Math.random() * 0.4);
    this.wander = { x, y };
    this.shadow = scene.add.image(x + SHADOW_X, y + SHADOW_Y, 'drone-shadow').setScale(1 / ART_SCALE).setDepth(3);
    this.img = scene.add.image(x, y, 'drone' + skin).setScale(1 / ART_SCALE).setDepth(9.5).setRotation(angle);
  }

  update(dt: number, ctx: AiContext): void {
    if (!this.alive) return;
    this.sense(dt, ctx);
    const p = ctx.player;
    if (this.engaged && this.lostTimer > GIVE_UP_AFTER) this.engaged = false;

    // Where to fly: a point circling the player, the last place it was seen, or a wander point near home.
    let tx: number;
    let ty: number;
    const speed = this.def.speed ?? 180;
    if (this.engaged && this.canSee) {
      this.orbitTimer -= dt;
      if (this.orbitTimer <= 0) {
        this.orbitTimer = 3 + Math.random() * 4;
        this.orbitDir = -this.orbitDir;
      }
      this.orbit += ((this.orbitDir * speed * 0.8) / this.orbitRange) * dt;
      tx = p.x + Math.cos(this.orbit) * this.orbitRange;
      ty = p.y + Math.sin(this.orbit) * this.orbitRange;
    } else if (this.engaged) {
      tx = this.lastSeen.x;
      ty = this.lastSeen.y;
      // Pick the orbit angle it will arrive on.
      this.orbit = Math.atan2(this.y - p.y, this.x - p.x);
    } else {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 3 + Math.random() * 3;
        const a = Math.random() * Math.PI * 2;
        const r = 80 + Math.random() * 220;
        this.wander.x = this.home.x + Math.cos(a) * r;
        this.wander.y = this.home.y + Math.sin(a) * r;
      }
      tx = this.wander.x;
      ty = this.wander.y;
    }

    // Steer: head for the point, easing off as it gets close.
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const want = d > 1 ? (speed * Math.min(1, d / 90)) / d : 0;
    const accel = (this.def.accel ?? 240) * dt;
    this.vx += Math.max(-accel, Math.min(accel, dx * want - this.vx));
    this.vy += Math.max(-accel, Math.min(accel, dy * want - this.vy));
    this.x = Math.max(this.radius, Math.min(ctx.world.width - this.radius, this.x + this.vx * dt));
    this.y = Math.max(this.radius, Math.min(ctx.world.height - this.radius, this.y + this.vy * dt));

    const heading = Math.hypot(this.vx, this.vy) > 20 ? Math.atan2(this.vy, this.vx) : this.gunAngle;
    this.aimAndFire(dt, ctx, heading, 12);

    this.bob += dt * 6;
    const scale = (1 + Math.sin(this.bob) * 0.04) / ART_SCALE;
    this.img.setPosition(this.x, this.y).setRotation(this.gunAngle).setScale(scale);
    this.shadow.setPosition(this.x + SHADOW_X, this.y + SHADOW_Y);
    if (this.hp < this.maxHp) this.updateBar();
  }

  protected parts(): Phaser.GameObjects.Image[] {
    return this.alive ? [this.img, this.shadow] : [this.img];
  }

  protected onDestroyed(fx: Effects): void {
    // Falls out of the sky where its shadow was.
    this.x += SHADOW_X * 0.5;
    this.y += SHADOW_Y * 0.5;
    this.img.setTexture('drone-wreck').setDepth(2).setScale(1 / ART_SCALE).setPosition(this.x, this.y);
    this.shadow.setVisible(false);
    fx.explosion(this.x, this.y, 0.6);
  }
}
