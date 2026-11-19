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
  // Arm (one texture, used for both sides): pod with a forward barrel. Separate from the body so it can be shot off.
  bake(scene, 'mech-arm', 76, 22, (g) => {
    g.fillStyle(C.hullDark).fillRect(14, -3, 22, 6);
    g.fillStyle(C.hull).fillRoundedRect(-14, -9, 30, 18, 4);
    g.lineStyle(1.5, C.edge, 0.8).strokeRoundedRect(-14, -9, 30, 18, 4);
  });
  // Torn-off arm stump.
  bake(scene, 'mech-arm-stub', 76, 22, (g) => {
    g.fillStyle(0x2a2f33).fillRoundedRect(-10, -7, 12, 14, 3);
    g.lineStyle(1.5, 0xff7a3d, 0.9).lineBetween(2, -6, 2, 6);
  });

  bake(scene, 'mech-torso', 76, 72, (g) => {
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

const E = {
  hull: 0x5b6450,
  hullDark: 0x3d4436,
  edge: 0x9aa58a,
  accent: 0xff5a4f,
};

/** Enemy art, projectiles, effects and HUD pieces. */
export function bakeCombatArt(scene: Phaser.Scene): void {
  // Tank hull: tracks either side, body, red sensor light at the front.
  for (const wreck of [false, true]) {
    const k = wreck ? 'tank-hull-wreck' : 'tank-hull';
    bake(scene, k, 64, 52, (g) => {
      const a = wreck ? 0.55 : 1;
      g.fillStyle(wreck ? 0x232628 : C.hullDark, 1);
      g.fillRoundedRect(-28, -24, 56, 12, 3);
      g.fillRoundedRect(-28, 12, 56, 12, 3);
      g.fillStyle(wreck ? 0x2e3330 : E.hull, 1).fillRoundedRect(-24, -15, 48, 30, 5);
      g.lineStyle(1.5, wreck ? 0x45494a : E.edge, a).strokeRoundedRect(-24, -15, 48, 30, 5);
      if (!wreck) g.fillStyle(E.accent).fillRect(19, -4, 4, 8);
    });
  }
  bake(scene, 'tank-turret', 60, 30, (g) => {
    g.fillStyle(E.hullDark).fillRect(6, -3, 22, 6);
    g.fillStyle(E.hull).fillCircle(0, 0, 11);
    g.lineStyle(1.5, E.edge).strokeCircle(0, 0, 11);
  });

  // Turrets: armoured base and a rotating gun.
  for (const wreck of [false, true]) {
    bake(scene, wreck ? 'turret-base-wreck' : 'turret-base', 56, 56, (g) => {
      g.fillStyle(wreck ? 0x26292b : E.hullDark);
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        if (i === 0) g.moveTo(Math.cos(a) * 25, Math.sin(a) * 25);
        else g.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
      }
      g.closePath();
      g.fillPath();
      g.lineStyle(1.5, wreck ? 0x45494a : E.edge, 1).strokePath();
    });
  }
  bake(scene, 'turret-gun', 64, 30, (g) => {
    g.fillStyle(E.hullDark).fillRect(6, -5, 22, 3).fillRect(6, 2, 22, 3);
    g.fillStyle(E.hull).fillCircle(0, 0, 12);
    g.lineStyle(1.5, E.edge).strokeCircle(0, 0, 12);
    g.fillStyle(E.accent).fillCircle(4, 0, 3);
  });
  bake(scene, 'turret-cannon', 72, 34, (g) => {
    g.fillStyle(E.hullDark).fillRect(8, -4, 26, 8);
    g.fillStyle(E.hull).fillRoundedRect(-13, -13, 26, 26, 5);
    g.lineStyle(1.5, E.edge).strokeRoundedRect(-13, -13, 26, 26, 5);
    g.fillStyle(E.accent).fillCircle(3, 0, 3);
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
