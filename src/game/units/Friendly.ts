import Phaser from 'phaser';
import type { CollisionWorld, Circle } from '../../core/collision';
import { DEG, approach, approachAngle, wrapAngle, type Vec } from '../../core/math';
import { ART_SCALE } from '../art';
import type { Effects } from '../combat/Effects';
import type { Team, Unit } from '../combat/types';

const BAR_WIDTH = 50;

/**
 * Units on the player's side that the enemy goes after (milestone 10 part 2): generators on
 * defend missions, convoy trucks on escort missions. The player's shots pass them by; enemy
 * shots, splash and missiles hurt them. Always visible (no fog of war for your own side).
 */
export abstract class FriendlyUnit implements Unit {
  readonly team: Team = 'player';
  alive = true;
  hp: number;
  vx = 0;
  vy = 0;
  /** Seconds since it was last hit, for the HUD. */
  lastHitAt = -Infinity;
  protected img: Phaser.GameObjects.Image;
  private barBg: Phaser.GameObjects.Image;
  private barFill: Phaser.GameObjects.Image;

  constructor(
    protected scene: Phaser.Scene,
    texture: string,
    public x: number,
    public y: number,
    public radius: number,
    readonly maxHp: number,
    angle = 0,
  ) {
    this.hp = maxHp;
    this.img = scene.add.image(x, y, texture).setScale(1 / ART_SCALE).setDepth(4).setRotation(angle);
    this.barBg = scene.add.image(0, 0, 'px-bg').setOrigin(0, 0.5).setDepth(11).setVisible(false);
    this.barFill = scene.add.image(0, 0, 'px-armor').setOrigin(0, 0.5).setDepth(11).setVisible(false);
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHitAt = performance.now();
    if (this.hp === 0) this.alive = false;
    this.updateBar();
  }

  /** Called once by the scene when it dies. */
  destroy(fx: Effects): void {
    this.barBg.setVisible(false);
    this.barFill.setVisible(false);
    this.onDestroyed(fx);
  }

  protected abstract onDestroyed(fx: Effects): void;

  protected updateBar(): void {
    const show = this.alive && this.hp < this.maxHp;
    const y = this.y - this.radius - 14;
    this.barBg.setVisible(show).setPosition(this.x - BAR_WIDTH / 2 - 1, y).setDisplaySize(BAR_WIDTH + 2, 6);
    this.barFill
      .setVisible(show)
      .setPosition(this.x - BAR_WIDTH / 2, y)
      .setDisplaySize(Math.max(1, BAR_WIDTH * (this.hp / this.maxHp)), 4)
      .setTexture(this.hp / this.maxHp < 0.35 ? 'px-hot' : 'px-armor');
  }
}

/** Defend missions: a generator the enemy waves are sent to destroy. */
export class Generator extends FriendlyUnit {
  constructor(scene: Phaser.Scene, x: number, y: number, hp: number) {
    super(scene, 'generator', x, y, 36, hp);
  }

  pulse(time: number): void {
    if (this.alive) this.img.setAlpha(0.88 + Math.sin(time * 0.003 + this.x) * 0.12);
  }

  protected onDestroyed(fx: Effects): void {
    this.img.setTexture('generator-wreck').setAlpha(1).setDepth(2);
    fx.explosion(this.x, this.y, 1.6);
  }
}

/**
 * Escort missions: a friendly truck driving the road to the far side. It only drives while
 * the player is close to the convoy (they won't go on alone), and keeps its distance from the
 * truck in front.
 */
export class ConvoyTruck extends FriendlyUnit {
  heading: number;
  path: Vec[] = [];
  ahead: ConvoyTruck | null = null;
  spacing = 90;
  /** Reached the end of the road. */
  arrived = false;
  private index = 0;
  private speed = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    hp: number,
    private maxSpeed: number,
  ) {
    super(scene, 'truck-ally', x, y, 26, hp, angle);
    this.heading = angle;
  }

  /** `go`: the player is near enough for the convoy to move. */
  update(dt: number, go: boolean, world: CollisionWorld, bodies: readonly Circle[]): void {
    if (!this.alive || this.arrived) return;
    while (this.index < this.path.length && Math.hypot(this.path[this.index].x - this.x, this.path[this.index].y - this.y) < 40) this.index++;
    if (this.index >= this.path.length) {
      this.arrived = true;
      this.img.setAlpha(0.5);
      this.vx = this.vy = 0;
      return;
    }
    let target = 0;
    if (go) {
      const wp = this.path[this.index];
      const want = Math.atan2(wp.y - this.y, wp.x - this.x);
      this.heading = wrapAngle(approachAngle(this.heading, want, 70 * DEG * dt));
      target = this.maxSpeed * Math.max(0, Math.cos(wrapAngle(want - this.heading)));
      const a = this.ahead;
      if (a && a.alive && !a.arrived && Math.hypot(a.x - this.x, a.y - this.y) < this.spacing) target = 0;
    }
    this.speed = approach(this.speed, target, 60 * dt);
    const pos = { x: this.x + Math.cos(this.heading) * this.speed * dt, y: this.y + Math.sin(this.heading) * this.speed * dt };
    world.resolveCircle(pos, this.radius, bodies, this, 35);
    this.vx = dt > 0 ? (pos.x - this.x) / dt : 0;
    this.vy = dt > 0 ? (pos.y - this.y) / dt : 0;
    this.x = pos.x;
    this.y = pos.y;
    this.img.setPosition(this.x, this.y).setRotation(this.heading);
    if (this.hp < this.maxHp) this.updateBar();
  }

  protected onDestroyed(fx: Effects): void {
    this.img.setTexture('truck-wreck').setDepth(2);
    fx.explosion(this.x, this.y, 1.1);
  }
}
