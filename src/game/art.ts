import Phaser from 'phaser';
import { DAMAGE_RULES as DAMAGE_ARCS } from '../data/damage';

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

/** Enemy mechs: rust red armour with a hostile red accent. */
const ENEMY_MECH = {
  hull: 0x6e4a45,
  hullDark: 0x48302d,
  edge: 0xb88a80,
  accent: 0xff5a4f,
  canopy: 0x1c1416,
};
const TECH_MECH = {
  hull: 0x46607e,
  hullDark: 0x2c3e54,
  edge: 0x9cc4ec,
  accent: 0x9fd8ff,
  canopy: 0x121a24,
};
const FREE_MECH = {
  hull: 0x725f44,
  hullDark: 0x4b3e2c,
  edge: 0xbca178,
  accent: 0xff9a3d,
  canopy: 0x1c1712,
};
const WRECK_MECH = {
  hull: 0x34383b,
  hullDark: 0x232628,
  edge: 0x4a5055,
  accent: 0x3b3f42,
  canopy: 0x161819,
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

  // Mech parts in three colour sets: the player's, enemy mechs, and wrecks (no tint in Canvas mode).
  for (const [suffix, P] of [
    ['', C],
    ['-enemy', ENEMY_MECH],
    ['-royal', ENEMY_MECH],
    ['-tech', TECH_MECH],
    ['-free', FREE_MECH],
    ['-wreck', WRECK_MECH],
  ] as const) {
    // Foot: a long pad with three forward talons, so walking direction reads at a glance.
    bake(scene, 'mech-foot' + suffix, 44, 22, (g) => {
      g.fillStyle(P.hull);
      for (const ty of [-6, 0, 6]) {
        g.beginPath();
        g.moveTo(8, ty - 2.5);
        g.lineTo(20, ty);
        g.lineTo(8, ty + 2.5);
        g.closePath();
        g.fillPath();
      }
      g.fillStyle(P.hullDark).fillRoundedRect(-16, -8, 26, 16, 4);
      g.lineStyle(1.5, P.edge, 0.8).strokeRoundedRect(-16, -8, 26, 16, 4);
      g.fillStyle(P.hull).fillRect(-14, -3, 5, 6);
    });

    // Hips: crossbar joining the legs.
    bake(scene, 'mech-hips' + suffix, 22, 56, (g) => {
      g.fillStyle(P.hullDark).fillRoundedRect(-7, -26, 14, 52, 5);
      g.lineStyle(1.5, P.edge, 0.6).strokeRoundedRect(-7, -26, 14, 52, 5);
    });

    // Torso: armoured body, two arm pods with guns pointing forward, cockpit, accent stripe.
    // Arm (one texture, used for both sides): pod with a forward barrel. Separate from the body so it can be shot off.
    bake(scene, 'mech-arm' + suffix, 76, 22, (g) => {
      g.fillStyle(P.hullDark).fillRect(14, -3, 22, 6);
      g.fillStyle(P.hull).fillRoundedRect(-14, -9, 30, 18, 4);
      g.lineStyle(1.5, P.edge, 0.8).strokeRoundedRect(-14, -9, 30, 18, 4);
    });
    // Torn-off arm stump.
    if (suffix === '') {
      bake(scene, 'mech-arm-stub', 76, 22, (g) => {
        g.fillStyle(0x2a2f33).fillRoundedRect(-10, -7, 12, 14, 3);
        g.lineStyle(1.5, 0xff7a3d, 0.9).lineBetween(2, -6, 2, 6);
      });
    }

    bake(scene, 'mech-torso' + suffix, 76, 72, (g) => {
      // Body.
      g.fillStyle(P.hull);
      g.beginPath();
      g.moveTo(-20, -17);
      g.lineTo(10, -19);
      g.lineTo(22, -8);
      g.lineTo(22, 8);
      g.lineTo(10, 19);
      g.lineTo(-20, 17);
      g.closePath();
      g.fillPath();
      g.lineStyle(2, P.edge, 1).strokePath();
      // Cockpit.
      g.fillStyle(P.canopy).fillRoundedRect(4, -7, 13, 14, 3);
      g.lineStyle(1.5, P.accent, 1).strokeRoundedRect(4, -7, 13, 14, 3);
      // Back plate stripe.
      g.fillStyle(P.accent).fillRect(-17, -10, 4, 20);
    });
  }

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
  // Right stick: inner ring marks where aiming turns into firing.
  bake(
    scene,
    'stick-ring',
    124,
    124,
    (g) => {
      g.lineStyle(1.5, 0xff9a5a, 0.45).strokeCircle(0, 0, 46);
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

/**
 * Enemy army colours. '' is the faction-neutral army (dev spawns, old saves); the
 * others are the Royalists (red), Technocrats (blue) and Freestars (dirt brown).
 */
const ARMY_PALETTES: Record<string, { hull: number; hullDark: number; edge: number; accent: number }> = {
  '': { hull: 0x5b6450, hullDark: 0x3d4436, edge: 0x9aa58a, accent: 0xff5a4f },
  '-royal': { hull: 0x7a4a44, hullDark: 0x4e2f2b, edge: 0xc99086, accent: 0xff5a4f },
  '-tech': { hull: 0x3f5a78, hullDark: 0x283b50, edge: 0x95bde6, accent: 0x9fd8ff },
  '-free': { hull: 0x6e5c40, hullDark: 0x4a3c2a, edge: 0xb89c72, accent: 0xff9a3d },
};

/** Small four-rotor drone (facing +x). */
function bakeDrone(scene: Phaser.Scene, key: string, body: number, rotor: number, light: number): void {
  bake(scene, key, 40, 40, (g) => {
    g.lineStyle(3, body, 1);
    for (const [x, y] of [[10, -10], [10, 10], [-10, -10], [-10, 10]]) g.lineBetween(0, 0, x, y);
    g.fillStyle(rotor, 0.45);
    for (const [x, y] of [[10, -10], [10, 10], [-10, -10], [-10, 10]]) g.fillCircle(x, y, 7);
    g.lineStyle(1, rotor, 0.9);
    for (const [x, y] of [[10, -10], [10, 10], [-10, -10], [-10, 10]]) g.strokeCircle(x, y, 7);
    g.fillStyle(body).fillRoundedRect(-7, -5, 15, 10, 3);
    g.fillStyle(0x2a1e1c).fillRect(6, -1.5, 8, 3);
    g.fillStyle(light).fillCircle(3, 0, 2.2);
  });
}

/** Enemy art, projectiles, effects and HUD pieces. */
export function bakeCombatArt(scene: Phaser.Scene): void {
  // Enemy vehicles, turrets and drones, in each army's colours (no tint in Canvas mode).
  for (const [skin, P] of Object.entries(ARMY_PALETTES)) {
    // Tank hull: tracks either side, body, sensor light at the front.
    bake(scene, 'tank-hull' + skin, 64, 52, (g) => {
      g.fillStyle(P.hullDark, 1);
      g.fillRoundedRect(-28, -24, 56, 12, 3);
      g.fillRoundedRect(-28, 12, 56, 12, 3);
      g.fillStyle(P.hull, 1).fillRoundedRect(-24, -15, 48, 30, 5);
      g.lineStyle(1.5, P.edge, 1).strokeRoundedRect(-24, -15, 48, 30, 5);
      g.fillStyle(P.accent).fillRect(19, -4, 4, 8);
    });
    bake(scene, 'tank-turret' + skin, 60, 30, (g) => {
      g.fillStyle(P.hullDark).fillRect(6, -3, 22, 6);
      g.fillStyle(P.hull).fillCircle(0, 0, 11);
      g.lineStyle(1.5, P.edge).strokeCircle(0, 0, 11);
    });
    // Heavy tank: wider, longer, double tracks and a twin-barrel turret.
    bake(scene, 'tank-heavy-hull' + skin, 84, 70, (g) => {
      g.fillStyle(P.hullDark, 1);
      g.fillRoundedRect(-38, -32, 76, 16, 4);
      g.fillRoundedRect(-38, 16, 76, 16, 4);
      g.fillStyle(P.hull, 1).fillRoundedRect(-33, -20, 66, 40, 6);
      g.lineStyle(2, P.edge, 1).strokeRoundedRect(-33, -20, 66, 40, 6);
      g.lineStyle(1, P.edge, 0.6).lineBetween(-20, -20, -20, 20);
      g.fillStyle(P.accent).fillRect(27, -5, 4, 10);
    });
    bake(scene, 'tank-heavy-turret' + skin, 80, 40, (g) => {
      g.fillStyle(P.hullDark).fillRect(8, -6, 30, 4).fillRect(8, 2, 30, 4);
      g.fillStyle(P.hull).fillRoundedRect(-15, -14, 28, 28, 6);
      g.lineStyle(1.5, P.edge).strokeRoundedRect(-15, -14, 28, 28, 6);
    });
    // Laser tank turret: a lens instead of a barrel.
    bake(scene, 'tank-laser-turret' + skin, 60, 30, (g) => {
      g.fillStyle(P.hullDark).fillRect(6, -2.5, 16, 5);
      g.fillStyle(P.hull).fillCircle(0, 0, 11);
      g.lineStyle(1.5, P.edge).strokeCircle(0, 0, 11);
      g.fillStyle(0xbfe8ff).fillCircle(23, 0, 3.5);
    });
    // Technical: a pickup truck with a gun in the bed.
    bake(scene, 'technical-hull' + skin, 52, 32, (g) => {
      g.fillStyle(0x1e2124).fillRect(-17, -14, 9, 4).fillRect(-17, 10, 9, 4).fillRect(10, -14, 9, 4).fillRect(10, 10, 9, 4);
      g.fillStyle(P.hull).fillRoundedRect(-20, -11, 42, 22, 4);
      g.lineStyle(1.5, P.edge).strokeRoundedRect(-20, -11, 42, 22, 4);
      g.fillStyle(0x1c2329).fillRoundedRect(6, -8, 9, 16, 2);
      g.fillStyle(P.accent).fillRect(19, -7, 2, 3).fillRect(19, 4, 2, 3);
    });
    bake(scene, 'technical-gun' + skin, 44, 16, (g) => {
      g.fillStyle(P.hullDark).fillRect(2, -1.5, 16, 3);
      g.fillStyle(P.edge).fillCircle(0, 0, 4);
    });

    // Turrets: armoured base and a rotating gun.
    bake(scene, 'turret-base' + skin, 56, 56, (g) => {
      g.fillStyle(P.hullDark);
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        if (i === 0) g.moveTo(Math.cos(a) * 25, Math.sin(a) * 25);
        else g.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      }
      g.closePath();
      g.fillPath();
      g.lineStyle(1.5, P.edge, 1).strokePath();
    });
    bake(scene, 'turret-gun' + skin, 64, 30, (g) => {
      g.fillStyle(P.hullDark).fillRect(6, -5, 22, 3).fillRect(6, 2, 22, 3);
      g.fillStyle(P.hull).fillCircle(0, 0, 12);
      g.lineStyle(1.5, P.edge).strokeCircle(0, 0, 12);
      g.fillStyle(P.accent).fillCircle(4, 0, 3);
    });
    bake(scene, 'turret-cannon' + skin, 72, 34, (g) => {
      g.fillStyle(P.hullDark).fillRect(8, -4, 26, 8);
      g.fillStyle(P.hull).fillRoundedRect(-13, -13, 26, 26, 5);
      g.lineStyle(1.5, P.edge).strokeRoundedRect(-13, -13, 26, 26, 5);
      g.fillStyle(P.accent).fillCircle(3, 0, 3);
    });
    bake(scene, 'turret-laser' + skin, 64, 34, (g) => {
      g.fillStyle(P.hullDark).fillRect(8, -3, 18, 6);
      g.fillStyle(P.hull).fillCircle(0, 0, 13);
      g.lineStyle(1.5, P.edge).strokeCircle(0, 0, 13);
      g.fillStyle(0xbfe8ff).fillCircle(28, 0, 4);
      g.fillStyle(P.accent).fillCircle(3, 0, 3);
    });
    bakeDrone(scene, 'drone' + skin, P.hull, P.edge, P.accent);
    // Convoy truck: cab at the front, covered cargo bed behind.
    bake(scene, 'truck' + skin, 66, 40, (g) => {
      g.fillStyle(0x1e2124).fillRect(-24, -17, 12, 4).fillRect(-24, 13, 12, 4).fillRect(14, -17, 10, 4).fillRect(14, 13, 10, 4);
      g.fillStyle(P.hullDark).fillRoundedRect(-30, -15, 40, 30, 3);
      g.lineStyle(1.5, P.edge, 0.8).strokeRoundedRect(-30, -15, 40, 30, 3);
      g.lineStyle(1, P.edge, 0.4);
      for (const x of [-20, -10, 0]) g.lineBetween(x, -15, x, 15);
      g.fillStyle(P.hull).fillRoundedRect(13, -13, 17, 26, 4);
      g.fillStyle(0x1c2329).fillRect(23, -9, 5, 18);
      g.fillStyle(P.accent).fillRect(29, -11, 2, 3).fillRect(29, 8, 2, 3);
    });
  }
  bake(scene, 'truck-wreck', 66, 40, (g) => {
    g.fillStyle(0x26292b).fillRoundedRect(-30, -15, 40, 30, 3);
    g.fillStyle(0x2e3330).fillRoundedRect(13, -13, 17, 26, 4);
    g.lineStyle(1.5, 0x45494a, 0.6).strokeRoundedRect(-30, -15, 40, 30, 3);
  });
  // Intel ping: where the hunted mech was last reported.
  bake(scene, 'intel-ping', 120, 120, (g) => {
    g.lineStyle(3, 0xe8a33d, 0.9).strokeCircle(0, 0, 50);
    g.lineStyle(1.5, 0xe8a33d, 0.5).strokeCircle(0, 0, 34);
    g.lineStyle(2, 0xe8a33d, 0.9);
    g.lineBetween(-58, 0, -40, 0).lineBetween(40, 0, 58, 0).lineBetween(0, -58, 0, -40).lineBetween(0, 40, 0, 58);
  });
  // Wrecks: one charred version per shape.
  bake(scene, 'tank-hull-wreck', 64, 52, (g) => {
    g.fillStyle(0x232628, 1);
    g.fillRoundedRect(-28, -24, 56, 12, 3);
    g.fillRoundedRect(-28, 12, 56, 12, 3);
    g.fillStyle(0x2e3330, 1).fillRoundedRect(-24, -15, 48, 30, 5);
    g.lineStyle(1.5, 0x45494a, 0.55).strokeRoundedRect(-24, -15, 48, 30, 5);
  });
  bake(scene, 'tank-heavy-hull-wreck', 84, 70, (g) => {
    g.fillStyle(0x232628, 1);
    g.fillRoundedRect(-38, -32, 76, 16, 4);
    g.fillRoundedRect(-38, 16, 76, 16, 4);
    g.fillStyle(0x2e3330, 1).fillRoundedRect(-33, -20, 66, 40, 6);
    g.lineStyle(2, 0x45494a, 0.55).strokeRoundedRect(-33, -20, 66, 40, 6);
  });
  bake(scene, 'technical-hull-wreck', 52, 32, (g) => {
    g.fillStyle(0x2c2f31).fillRoundedRect(-20, -11, 42, 22, 4);
    g.lineStyle(1.5, 0x45494a, 0.6).strokeRoundedRect(-20, -11, 42, 22, 4);
  });
  bake(scene, 'turret-base-wreck', 56, 56, (g) => {
    g.fillStyle(0x26292b);
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      if (i === 0) g.moveTo(Math.cos(a) * 25, Math.sin(a) * 25);
      else g.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
    }
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0x45494a, 1).strokePath();
  });

  // Uplink tower (mission target): mast with dish arms and a pulsing core.
  for (const wreck of [false, true]) {
    bake(scene, wreck ? 'uplink-wreck' : 'uplink', 92, 92, (g) => {
      const edge = wreck ? 0x45494a : 0xe8a33d;
      g.fillStyle(wreck ? 0x232628 : 0x2a3036).fillCircle(0, 0, 38);
      g.lineStyle(2.5, edge, wreck ? 0.6 : 1).strokeCircle(0, 0, 38);
      g.lineStyle(4, wreck ? 0x3a3e40 : 0x7d8890);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        g.lineBetween(Math.cos(a) * 10, Math.sin(a) * 10, Math.cos(a) * 30, Math.sin(a) * 30);
      }
      if (!wreck) {
        g.fillStyle(0xff5a4f).fillCircle(0, 0, 9);
        g.lineStyle(2, 0xffb0a8).strokeCircle(0, 0, 9);
      }
    });
  }

  // Projectiles (drawn along +x).
  bake(scene, 'bullet', 14, 4, (g) => {
    g.fillStyle(0xfff1b8).fillRoundedRect(-6, -1.5, 12, 3, 1.5);
  });
  bake(scene, 'bullet-enemy', 14, 4, (g) => {
    g.fillStyle(0xff9a8a).fillRoundedRect(-6, -1.5, 12, 3, 1.5);
  });
  bake(scene, 'shell', 20, 8, (g) => {
    g.fillStyle(0xffc561).fillRoundedRect(-8, -3, 16, 6, 3);
    g.fillStyle(0xffffff).fillRoundedRect(0, -1.5, 7, 3, 1.5);
  });
  bake(scene, 'shell-enemy', 20, 8, (g) => {
    g.fillStyle(0xff6a55).fillRoundedRect(-8, -3, 16, 6, 3);
    g.fillStyle(0xffd0c8).fillRoundedRect(0, -1.5, 7, 3, 1.5);
  });
  // Laser beam: 64 long, stretched to length. Bright core with a soft glow.
  bake(scene, 'beam', 64, 12, (g) => {
    g.fillStyle(0x4fd8ff, 0.25).fillRect(-32, -5, 64, 10);
    g.fillStyle(0x7fe6ff, 0.6).fillRect(-32, -2.5, 64, 5);
    g.fillStyle(0xffffff, 1).fillRect(-32, -1, 64, 2);
  });

  // Missiles and rockets (drawn along +x).
  const missile = (key: string, body: number, tip: number) =>
    bake(scene, key, 18, 8, (g) => {
      g.fillStyle(body).fillRoundedRect(-7, -2, 12, 4, 1.5);
      g.fillStyle(tip).fillTriangle(5, -2, 9, 0, 5, 2);
      g.fillStyle(0x3a434b).fillTriangle(-7, -3.5, -4, 0, -7, 3.5);
    });
  missile('missile', 0xd6dde3, 0xe8a33d);
  missile('missile-enemy', 0xd6dde3, 0xff5a4f);
  bake(scene, 'rocket', 14, 6, (g) => {
    g.fillStyle(0xb7c0c7).fillRect(-5, -1.5, 9, 3);
    g.fillStyle(0xffc561).fillTriangle(4, -1.5, 7, 0, 4, 1.5);
  });
  bake(scene, 'flare', 16, 16, (g) => {
    g.fillStyle(0xffd27a, 0.4).fillCircle(0, 0, 6);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 2.5);
  });
  // More beams, all 64 long so the same code stretches them.
  bake(scene, 'beam-pulse', 64, 8, (g) => {
    g.fillStyle(0x6cff9a, 0.3).fillRect(-32, -3, 64, 6);
    g.fillStyle(0xd8ffe4, 1).fillRect(-32, -1, 64, 2);
  });
  bake(scene, 'beam-large', 64, 18, (g) => {
    g.fillStyle(0x4fd8ff, 0.2).fillRect(-32, -8, 64, 16);
    g.fillStyle(0x7fe6ff, 0.55).fillRect(-32, -4.5, 64, 9);
    g.fillStyle(0xffffff, 1).fillRect(-32, -1.75, 64, 3.5);
  });
  // Enemy beams: red instead of cyan/green.
  bake(scene, 'beam-enemy', 64, 12, (g) => {
    g.fillStyle(0xff4a3d, 0.25).fillRect(-32, -5, 64, 10);
    g.fillStyle(0xff8a7a, 0.6).fillRect(-32, -2.5, 64, 5);
    g.fillStyle(0xfff0ec, 1).fillRect(-32, -1, 64, 2);
  });
  bake(scene, 'beam-pulse-enemy', 64, 8, (g) => {
    g.fillStyle(0xff7a3d, 0.3).fillRect(-32, -3, 64, 6);
    g.fillStyle(0xffe4d8, 1).fillRect(-32, -1, 64, 2);
  });
  bake(scene, 'beam-large-enemy', 64, 18, (g) => {
    g.fillStyle(0xff4a3d, 0.2).fillRect(-32, -8, 64, 16);
    g.fillStyle(0xff8a7a, 0.55).fillRect(-32, -4.5, 64, 9);
    g.fillStyle(0xffffff, 1).fillRect(-32, -1.75, 64, 3.5);
  });
  // Drones: a small four-rotor craft (facing +x), its shadow on the ground, and a wreck.
  bakeDrone(scene, 'drone-wreck', 0x2c2f31, 0x3c4144, 0x3b3f42);
  bake(scene, 'drone-shadow', 40, 40, (g) => {
    g.fillStyle(0x000000, 0.3).fillCircle(0, 0, 14);
  });

  // Lightning: a few jagged variants, picked at random per arc.
  for (let v = 0; v < 3; v++) {
    bake(scene, `arc-${v}`, 64, 16, (g) => {
      const pts: [number, number][] = [[-32, 0]];
      for (let i = 1; i < 8; i++) pts.push([-32 + i * 8, Math.sin(i * 2.7 + v * 1.9) * 5 + Math.cos(i * 1.3 + v) * 2]);
      pts.push([32, 0]);
      for (const [w, a, c] of [[8, 0.2, 0x7fa8ff], [4, 0.45, 0xa8c8ff], [1.8, 1, 0xf6f9ff]] as const) {
        g.lineStyle(w, c, a);
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts) g.lineTo(p[0], p[1]);
        g.strokePath();
      }
    });
  }
  bake(scene, 'heavy-shell', 26, 10, (g) => {
    g.fillStyle(0xffb347).fillRoundedRect(-11, -4, 22, 8, 4);
    g.fillStyle(0xffffff).fillRoundedRect(1, -2, 9, 4, 2);
  });
  bake(scene, 'heavy-shell-enemy', 26, 10, (g) => {
    g.fillStyle(0xff6a55).fillRoundedRect(-11, -4, 22, 8, 4);
    g.fillStyle(0xffd0c8).fillRoundedRect(1, -2, 9, 4, 2);
  });
  bake(scene, 'plasma', 24, 24, (g) => {
    g.fillStyle(0x9a7bff, 0.25).fillCircle(0, 0, 11);
    g.fillStyle(0xc4a8ff, 0.6).fillCircle(0, 0, 7);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 3.5);
  });
  bake(scene, 'plasma-enemy', 24, 24, (g) => {
    g.fillStyle(0xff5ab4, 0.25).fillCircle(0, 0, 11);
    g.fillStyle(0xff9ad0, 0.6).fillCircle(0, 0, 7);
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, 3.5);
  });
  // Point defense tracer: same length as the beam texture so the same code stretches it.
  bake(scene, 'pd-tracer', 64, 6, (g) => {
    g.fillStyle(0xffe08a, 0.9).fillRect(-32, -0.75, 64, 1.5);
  });
  // Shield bubble around a mech.
  bake(scene, 'shield-bubble', 92, 92, (g) => {
    g.fillStyle(0x4fd8ff, 0.12).fillCircle(0, 0, 42);
    g.lineStyle(2, 0x7fe6ff, 0.7).strokeCircle(0, 0, 42);
  });
  // Evac zone: a green landing ring with chevrons pointing in.
  bake(scene, 'evac', 180, 180, (g) => {
    g.fillStyle(0x8fd16a, 0.12).fillCircle(0, 0, 80);
    g.lineStyle(4, 0x8fd16a, 0.9).strokeCircle(0, 0, 80);
    g.lineStyle(2, 0x8fd16a, 0.5).strokeCircle(0, 0, 60);
    g.fillStyle(0x8fd16a, 0.9);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.fillTriangle(c * 74 - s * 10, s * 74 + c * 10, c * 74 + s * 10, s * 74 - c * 10, c * 56, s * 56);
    }
  });

  // Field stations: a landing pad with an icon. Used ones go grey.
  const pad = (key: string, color: number, icon: (g: Phaser.GameObjects.Graphics) => void) =>
    bake(scene, key, 150, 150, (g) => {
      g.fillStyle(0x1a2026, 0.95).fillCircle(0, 0, 64);
      g.lineStyle(4, color, 0.9).strokeCircle(0, 0, 64);
      g.lineStyle(2, color, 0.4).strokeCircle(0, 0, 50);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.lineStyle(3, color, 0.6).lineBetween(Math.cos(a) * 54, Math.sin(a) * 54, Math.cos(a) * 62, Math.sin(a) * 62);
      }
      g.fillStyle(color, 0.95);
      icon(g);
    });
  pad('station-ammo', 0xffc561, (g) => {
    for (const x of [-14, 0, 14]) {
      g.fillRoundedRect(x - 4, -10, 8, 24, 3);
      g.fillTriangle(x - 4, -10, x + 4, -10, x, -20);
    }
  });
  pad('station-repair', 0x8fd16a, (g) => {
    g.fillRect(-6, -20, 12, 40);
    g.fillRect(-20, -6, 40, 12);
  });
  pad('station-swap', 0x7fe6ff, (g) => {
    g.fillRect(-18, -11, 26, 6);
    g.fillTriangle(8, -16, 20, -8, 8, 0);
    g.fillRect(-8, 5, 26, 6);
    g.fillTriangle(-8, 0, -20, 8, -8, 16);
  });
  pad('station-used', 0x56616b, (g) => {
    g.fillRect(-16, -3, 32, 6);
  });

  // Fog of war: last-seen marker and radar blip.
  bake(scene, 'ghost', 40, 40, (g) => {
    g.lineStyle(2.5, 0xff5a4f, 0.9);
    g.strokeRect(-11, -11, 22, 22);
    g.lineBetween(-5, 0, 5, 0);
    g.lineBetween(0, -5, 0, 5);
  });
  bake(scene, 'blip', 36, 36, (g) => {
    g.fillStyle(0xff5a4f, 0.9).fillCircle(0, 0, 6);
    g.lineStyle(2, 0xff5a4f, 0.45).strokeCircle(0, 0, 14);
  });

  // Missile lock reticle on a target.
  bake(scene, 'lock', 70, 70, (g) => {
    g.lineStyle(2.5, 0xff9a3d, 0.95);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      g.lineBetween(sx * 30, sy * 30, sx * 30 - sx * 10, sy * 30);
      g.lineBetween(sx * 30, sy * 30, sx * 30, sy * 30 - sy * 10);
    }
  });

  // Effects.
  bake(scene, 'spark', 8, 8, (g) => {
    g.fillStyle(0xffe08a).fillCircle(0, 0, 2.5);
  });
  bake(scene, 'flash', 40, 40, (g) => {
    g.fillStyle(0xffd27a, 0.35).fillCircle(0, 0, 18);
    g.fillStyle(0xfff3c9, 0.9).fillCircle(0, 0, 8);
  });
  bake(scene, 'ring', 100, 100, (g) => {
    g.lineStyle(5, 0xffb347, 1).strokeCircle(0, 0, 44);
  });
  bake(scene, 'smoke', 40, 40, (g) => {
    g.fillStyle(0x2a2d30, 0.7).fillCircle(0, 0, 18);
  });
  bake(scene, 'scorch', 120, 120, (g) => {
    g.fillStyle(0x0d0f10, 0.35).fillCircle(0, 0, 56);
    g.fillStyle(0x0d0f10, 0.35).fillCircle(0, 0, 38);
  });

  // Solid swatches for bars (scaled with setDisplaySize; no tint, so Canvas mode works).
  const swatches: Record<string, [number, number]> = {
    'px-white': [0xffffff, 1],
    'px-bg': [0x0b0e11, 0.75],
    'px-armor': [0x8fd16a, 1],
    'px-heat': [0xe8a33d, 1],
    'px-hot': [0xff4d3d, 1],
    'px-enemy': [0xff5a4f, 1],
    'px-dim': [0x56616b, 1],
    'px-cyan': [0x4fd8ff, 1],
  };
  for (const [key, [color, alpha]] of Object.entries(swatches)) {
    bake(scene, key, 4, 4, (g) => g.fillStyle(color, alpha).fillRect(-2, -2, 4, 4), 1);
  }

  // Off-screen indicators (HUD, CSS px, baked at 3x). Point along +x.
  bake(
    scene,
    'edge-target',
    30,
    30,
    (g) => {
      g.fillStyle(0xe8a33d).fillTriangle(12, 0, -6, -9, -6, 9);
      g.lineStyle(2, 0x0b0e11, 0.8).strokeTriangle(12, 0, -6, -9, -6, 9);
    },
    3,
  );
  bake(
    scene,
    'edge-station',
    22,
    22,
    (g) => {
      g.fillStyle(0x7fe6ff, 0.9).fillTriangle(8, 0, -4, -6, -4, 6);
    },
    3,
  );
  bake(
    scene,
    'edge-threat',
    22,
    22,
    (g) => {
      g.fillStyle(0xff5a4f, 0.9).fillTriangle(8, 0, -4, -6, -4, 6);
    },
    3,
  );
  // Phone fire button.
  bake(
    scene,
    'button',
    84,
    84,
    (g) => {
      g.fillStyle(0xffffff, 0.08).fillCircle(0, 0, 40);
      g.lineStyle(2, 0xffffff, 0.4).strokeCircle(0, 0, 40);
    },
    3,
  );
}

/** Condition colours for the HUD silhouette: index 0 = healthy ... 3 = critical, 4 = destroyed, 5 = hit flash. */
export const CONDITION_COLORS = [0x8fd16a, 0xd8d05a, 0xe8a33d, 0xff4d3d, 0x22272b, 0xffffff];

/** HUD silhouette pieces, damage indicators and debug overlays. */
export function bakeDamageArt(scene: Phaser.Scene): void {
  CONDITION_COLORS.forEach((color, i) => {
    const destroyed = i === 4;
    const piece = (key: string, w: number, h: number, r: number) =>
      bake(
        scene,
        `${key}-${i}`,
        w + 2,
        h + 2,
        (g) => {
          g.fillStyle(color, destroyed ? 1 : 0.9).fillRoundedRect(-w / 2, -h / 2, w, h, r);
          g.lineStyle(1, destroyed ? 0xff4d3d : 0x0b0e11, destroyed ? 0.9 : 0.6).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
          if (destroyed) g.lineBetween(-w / 2 + 2, -h / 2 + 2, w / 2 - 2, h / 2 - 2);
        },
        3,
      );
    piece('sil-torso', 16, 22, 3);
    piece('sil-arm', 8, 20, 2);
    piece('sil-legs', 28, 10, 3);
  });

  // Hit direction: a red arc on a ring, centred on the texture so it rotates around the mech.
  bake(
    scene,
    'hit-arc',
    150,
    150,
    (g) => {
      for (let i = 0; i < 2; i++) {
        g.lineStyle(4 - i * 2, 0xff4d3d, 0.45 + i * 0.45);
        g.beginPath();
        g.arc(0, 0, 50, -0.3, 0.3);
        g.strokePath();
      }
    },
    3,
  );

  // Debug: the hit arcs around a mech (front green, sides blue, rear red), drawn facing +x.
  bake(scene, 'debug-arcs', 180, 180, (g) => {
    const wedge = (from: number, to: number, color: number) => {
      g.fillStyle(color, 0.18);
      g.beginPath();
      g.slice(0, 0, 88, from, to, false);
      g.fillPath();
    };
    const f = (DAMAGE_ARCS.frontDeg * Math.PI) / 180;
    const r = Math.PI - (DAMAGE_ARCS.rearDeg * Math.PI) / 180;
    wedge(-f, f, 0x8fd16a);
    wedge(f, r, 0x4fa8ff);
    wedge(-r, -f, 0x4fa8ff);
    wedge(r, Math.PI * 2 - r, 0xff4d3d);
  });
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
