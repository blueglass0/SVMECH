import Phaser from 'phaser';

/** World radius the overlay covers around the mech: enough for any screen, including camera lead. */
const COVER = 1400;
/** Texture size. Low resolution is fine (and cheap): the edges are meant to be soft. */
const SIZE = 512;
const FOG_COLOR = 'rgb(5,7,10)';

export interface Vision {
  coneDeg: number;
  range: number;
  radius: number;
}

/**
 * Fog of war overlay: darkness everywhere except a cone in front of the torso
 * and a small circle around the mech. Baked once per mission into a canvas
 * texture, then drawn as one rotated sprite per frame. Works in WebGL and Canvas.
 */
export class FogOverlay {
  private img: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, vision: Vision) {
    const key = `fog-${vision.coneDeg}-${vision.range}-${vision.radius}`;
    if (!scene.textures.exists(key)) bake(scene, key, vision);
    this.img = scene.add.image(0, 0, key).setScale((COVER * 2) / SIZE).setDepth(13);
  }

  update(x: number, y: number, angle: number, alpha: number): void {
    this.img.setPosition(x, y).setRotation(angle).setAlpha(alpha).setVisible(alpha > 0);
  }
}

function bake(scene: Phaser.Scene, key: string, v: Vision): void {
  const tex = scene.textures.createCanvas(key, SIZE, SIZE)!;
  const ctx = tex.getContext();
  const c = SIZE / 2;
  const s = SIZE / (COVER * 2);
  ctx.fillStyle = FOG_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Cut the visible area out in several slightly growing passes for a soft edge.
  ctx.globalCompositeOperation = 'destination-out';
  const cone = (v.coneDeg * Math.PI) / 180;
  const passes = 7;
  for (let i = 0; i < passes; i++) {
    const grow = 0.9 + (i / (passes - 1)) * 0.2;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, v.range * s * grow, -cone * grow, cone * grow);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, v.radius * s * grow, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
}
