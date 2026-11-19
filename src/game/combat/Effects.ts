import Phaser from 'phaser';
import { ART_SCALE } from '../art';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
  baseScale: number;
  fade: boolean;
}

/** A fixed-size, round-robin pool: when full, the oldest effect is reused. Never allocates during play. */
class Pool {
  private items: Particle[] = [];
  private next = 0;

  constructor(scene: Phaser.Scene, texture: string, size: number, depth: number, blendAdd = false) {
    for (let i = 0; i < size; i++) {
      const img = scene.add.image(0, 0, texture).setVisible(false).setDepth(depth);
      if (blendAdd) img.setBlendMode(Phaser.BlendModes.ADD);
      this.items.push({ img, vx: 0, vy: 0, life: 0, max: 1, grow: 0, baseScale: 1, fade: true });
    }
  }

  spawn(x: number, y: number, rotation: number, life: number, scale: number, vx = 0, vy = 0, grow = 0, fade = true): Particle {
    const p = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    p.img.setPosition(x, y).setRotation(rotation).setScale(scale / ART_SCALE).setAlpha(1).setVisible(true);
    p.vx = vx;
    p.vy = vy;
    p.life = p.max = life;
    p.grow = grow;
    p.baseScale = scale;
    p.fade = fade;
    return p;
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.img.setVisible(false);
        continue;
      }
      const k = p.life / p.max;
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      if (p.grow) p.img.setScale((p.baseScale + p.grow * (1 - k)) / ART_SCALE);
      if (p.fade) p.img.setAlpha(k);
    }
  }
}

/** Visual effects: sparks, muzzle flashes, explosions, smoke and scorch marks. All pooled and capped. */
export class Effects {
  private sparks: Pool;
  private flashes: Pool;
  private rings: Pool;
  private smoke: Pool;
  private scorch: Pool;
  private trails: Pool;
  private flares: Pool;

  constructor(scene: Phaser.Scene) {
    this.scorch = new Pool(scene, 'scorch', 24, 2);
    this.smoke = new Pool(scene, 'smoke', 24, 8);
    this.trails = new Pool(scene, 'smoke', 90, 6);
    this.flares = new Pool(scene, 'flare', 16, 9, true);
    this.sparks = new Pool(scene, 'spark', 64, 9, true);
    this.flashes = new Pool(scene, 'flash', 20, 9, true);
    this.rings = new Pool(scene, 'ring', 10, 9, true);
  }

  /** Bullet impact: a few sparks bouncing back from the surface. */
  impact(x: number, y: number, angle: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      const a = angle + Math.PI + (Math.random() - 0.5) * 2.2;
      const s = 120 + Math.random() * 220;
      this.sparks.spawn(x, y, 0, 0.12 + Math.random() * 0.15, 1, Math.cos(a) * s, Math.sin(a) * s);
    }
  }

  muzzle(x: number, y: number, angle: number, size = 0.6): void {
    this.flashes.spawn(x, y, angle, 0.06, size);
  }

  explosion(x: number, y: number, size = 1): void {
    this.flashes.spawn(x, y, 0, 0.25, 2.2 * size, 0, 0, 1.5 * size);
    this.rings.spawn(x, y, 0, 0.45, 0.3 * size, 0, 0, 1.3 * size);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (100 + Math.random() * 260) * size;
      this.sparks.spawn(x, y, 0, 0.3 + Math.random() * 0.3, 1.4, Math.cos(a) * s, Math.sin(a) * s);
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.spawn(x, y, 0, 1.2 + Math.random(), 1 * size, Math.cos(a) * 30, Math.sin(a) * 30, 1.2 * size);
    }
    this.scorch.spawn(x, y, Math.random() * 6, 9999, 0.9 * size, 0, 0, 0, false);
  }

  /** Smoke from a damaged section; destroyed sections also throw sparks. */
  puff(x: number, y: number, heavy: boolean): void {
    const a = Math.random() * Math.PI * 2;
    this.smoke.spawn(x, y, 0, 0.9, heavy ? 0.7 : 0.45, Math.cos(a) * 15, Math.sin(a) * 15 - 10, 0.8);
    if (heavy && Math.random() < 0.4) {
      const s = 80 + Math.random() * 120;
      this.sparks.spawn(x, y, 0, 0.25, 1, Math.cos(a) * s, Math.sin(a) * s);
    }
  }

  /** Missile exhaust puff. */
  trail(x: number, y: number): void {
    this.trails.spawn(x, y, 0, 0.35, 0.28, 0, 0, 0.3);
  }

  /** Flares thrown out around the mech. */
  flareBurst(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 90 + Math.random() * 90;
      this.flares.spawn(x, y, 0, 1.1 + Math.random() * 0.4, 1, Math.cos(a) * s, Math.sin(a) * s);
    }
  }

  update(dt: number): void {
    this.trails.update(dt);
    this.flares.update(dt);
    this.sparks.update(dt);
    this.flashes.update(dt);
    this.rings.update(dt);
    this.smoke.update(dt);
    this.scorch.update(dt);
  }
}
