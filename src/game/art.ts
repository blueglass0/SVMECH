import Phaser from 'phaser';

/**
 * Vector art, drawn once into textures at boot. Textures are baked at
 * ART_SCALE x their world size so they stay sharp when the camera zooms in;
 * sprites using them are scaled by 1 / ART_SCALE.
 *
 * Mech parts face right (+x), matching rotation 0.
 */
export const ART_SCALE = 2;

const C = {
  hull: 0x58636d,
  hullDark: 0x3a434b,
  edge: 0x9aa6b0,
  accent: 0xe8a33d,
  canopy: 0x1c2329,
};

type Draw = (g: Phaser.GameObjects.Graphics) => void;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw, scale = ART_SCALE): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  g.scaleCanvas(scale, scale);
  // Draw with the origin at the texture centre.
  g.translateCanvas(w / 2, h / 2);
  draw(g);
  g.generateTexture(key, Math.ceil(w * scale), Math.ceil(h * scale));
  g.destroy();
}

export function bakeArt(scene: Phaser.Scene): void {
  // Foot: a long pad with three forward talons, so walking direction reads at a glance.
  bake(scene, 'mech-foot', 44, 22, (g) => {
    g.fillStyle(C.hull);
    for (const ty of [-6, 0, 6]) {
      g.beginPath();
      g.moveTo(8, ty - 2.5);
      g.lineTo(20, ty);
      g.lineTo(8, ty + 2.5);
      g.closePath();
      g.fillPath();
    }
    g.fillStyle(C.hullDark).fillRoundedRect(-16, -8, 26, 16, 4);
    g.lineStyle(1.5, C.edge, 0.8).strokeRoundedRect(-16, -8, 26, 16, 4);
    g.fillStyle(C.hull).fillRect(-14, -3, 5, 6);
  });

  // Hips: crossbar joining the legs.
  bake(scene, 'mech-hips', 22, 56, (g) => {
    g.fillStyle(C.hullDark).fillRoundedRect(-7, -26, 14, 52, 5);
    g.lineStyle(1.5, C.edge, 0.6).strokeRoundedRect(-7, -26, 14, 52, 5);
  });

  // Leg heading marker on the ground: where the legs are walking (the torso marker is orange).
  bake(scene, 'leg-tick', 24, 28, (g) => {
    g.fillStyle(0xd6dde3, 0.7);
    g.beginPath();
    g.moveTo(-5, -11);
    g.lineTo(8, 0);
    g.lineTo(-5, 11);
    g.lineTo(-1, 0);
    g.closePath();
    g.fillPath();
  });

  // Torso: armoured body, two arm pods with guns pointing forward, cockpit, accent stripe.
  bake(scene, 'mech-torso', 76, 72, (g) => {
    // Arms (with barrels).
    for (const side of [-1, 1]) {
      const y = side * 25;
      g.fillStyle(C.hullDark).fillRect(14, y - 3, 22, 6);
      g.fillStyle(C.hull).fillRoundedRect(-14, y - 9, 30, 18, 4);
      g.lineStyle(1.5, C.edge, 0.8).strokeRoundedRect(-14, y - 9, 30, 18, 4);
    }
    // Body.
    g.fillStyle(C.hull);
    g.beginPath();
    g.moveTo(-20, -17);
    g.lineTo(10, -19);
    g.lineTo(22, -8);
    g.lineTo(22, 8);
    g.lineTo(10, 19);
    g.lineTo(-20, 17);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, C.edge, 1).strokePath();
    // Cockpit.
    g.fillStyle(C.canopy).fillRoundedRect(4, -7, 13, 14, 3);
    g.lineStyle(1.5, C.accent, 1).strokeRoundedRect(4, -7, 13, 14, 3);
    // Back plate stripe.
    g.fillStyle(C.accent).fillRect(-17, -10, 4, 20);
  });

  // Torso facing marker: a small chevron.
  bake(scene, 'aim-chevron', 24, 24, (g) => {
    g.lineStyle(3.5, C.accent, 1);
    g.beginPath();
    g.moveTo(-6, -8);
    g.lineTo(5, 0);
    g.lineTo(-6, 8);
    g.strokePath();
  });

  // Touch sticks (HUD, CSS px; baked at 3x for sharp phone screens).
  bake(
    scene,
    'stick-base',
    124,
    124,
    (g) => {
      g.fillStyle(0xffffff, 0.06).fillCircle(0, 0, 60);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(0, 0, 60);
    },
    3,
  );
  bake(
    scene,
    'stick-knob',
    56,
    56,
    (g) => {
      g.fillStyle(0xffffff, 0.22).fillCircle(0, 0, 26);
      g.lineStyle(2, 0xffffff, 0.6).strokeCircle(0, 0, 26);
    },
    3,
  );
}

/** Ground grid as one repeating tile (cheaper than hundreds of lines). */
export function bakeGroundTile(
  scene: Phaser.Scene,
  key: string,
  size: number,
  minor: number,
  colors: { ground: number; gridMinor: number; gridMajor: number },
): void {
  if (scene.textures.exists(key)) return;
  const s = ART_SCALE;
  const g = scene.make.graphics({}, false);
  g.scaleCanvas(s, s);
  g.fillStyle(colors.ground).fillRect(0, 0, size, size);
  g.fillStyle(colors.gridMinor);
  for (let p = minor; p < size; p += minor) {
    g.fillRect(p - 1, 0, 2, size);
    g.fillRect(0, p - 1, size, 2);
  }
  g.fillStyle(colors.gridMajor);
  g.fillRect(0, 0, 3, size);
  g.fillRect(0, 0, size, 3);
  g.generateTexture(key, size * s, size * s);
  g.destroy();
}
