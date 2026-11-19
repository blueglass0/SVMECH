import type Phaser from 'phaser';
import { actions } from '../core/input';
import { settings, saveSettings } from '../core/settings';
import { DEBUG } from '../core/debug';
import { portraitPhone } from '../core/orientation';
import { CHASSIS, STARTER_CHASSIS, type ChassisMovement } from '../data/chassis';
import type { MapScene, MissionResult } from '../scenes/MapScene';
import { play, setMuted } from '../core/audio';

/**
 * Menus and buttons are plain HTML laid over the canvas: crisp at any
 * resolution, cheap, and touches on them never reach the game's sticks.
 */
export function mountDomUi(game: Phaser.Game, container: HTMLElement): void {
  const bar = el('div', 'toolbar');
  container.appendChild(bar);

  // Movement scheme for the device currently in use.
  const schemeBtn = button(bar, '', () => {
    const d = actions.device;
    settings.scheme[d] = settings.scheme[d] === 'tank' ? 'direction' : 'tank';
    saveSettings();
    refresh();
  });
  schemeBtn.title = 'Switch between tank controls and direction-based movement';
  let shown = '';
  const refresh = () => {
    const label = `Controls: ${settings.scheme[actions.device] === 'tank' ? 'Tank' : 'Direction'}`;
    if (label !== shown) schemeBtn.textContent = shown = label;
  };
  refresh();
  // The active device changes from game input; a slow poll is plenty for a label.
  setInterval(refresh, 300);

  if (document.fullscreenEnabled) {
    const fsBtn = button(bar, '⛶', () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        document.documentElement
          .requestFullscreen({ navigationUI: 'hide' })
          .then(() => lockLandscape())
          .catch(() => {});
      }
    });
    fsBtn.title = 'Fullscreen';
    fsBtn.classList.add('icon');
  }

  const muteBtn = button(bar, '', () => {
    setMuted(!settings.muted);
    muteBtn.textContent = settings.muted ? '🔇' : '🔊';
  });
  muteBtn.textContent = settings.muted ? '🔇' : '🔊';
  muteBtn.title = 'Sound on/off';
  muteBtn.classList.add('icon');

  mountEndScreen(game, container);

  if (DEBUG) {
    const panel = tuningPanel(game);
    container.appendChild(panel);
    button(bar, 'Tune', () => panel.classList.toggle('open'));
  }

  // Phones are landscape-only: pause and release input while the rotate prompt shows.
  // (MapScene also checks this when it starts.)
  portraitPhone.addEventListener('change', () => {
    const map = game.scene.getScene('Map') as MapScene | null;
    if (!map || !(game.scene.isActive('Map') || game.scene.isPaused('Map'))) return;
    if (portraitPhone.matches) {
      map.releaseInput();
      map.scene.pause();
    } else {
      map.scene.resume();
    }
  });
}

function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  o.lock?.('landscape').catch(() => {});
}

const TUNABLES: { key: keyof ChassisMovement; label: string; min: number; max: number; step: number }[] = [
  { key: 'maxSpeed', label: 'Top speed', min: 40, max: 400, step: 5 },
  { key: 'reverseFactor', label: 'Reverse speed ×', min: 0.2, max: 1, step: 0.05 },
  { key: 'accel', label: 'Acceleration', min: 20, max: 600, step: 5 },
  { key: 'decel', label: 'Deceleration', min: 20, max: 600, step: 5 },
  { key: 'legTurnRate', label: 'Leg turn °/s', min: 20, max: 360, step: 5 },
  { key: 'legTurnAccel', label: 'Leg turn ramp °/s²', min: 40, max: 2000, step: 10 },
  { key: 'torsoTurnRate', label: 'Torso turn °/s', min: 20, max: 720, step: 5 },
  { key: 'strideLength', label: 'Stride length', min: 20, max: 120, step: 2 },
  { key: 'stepShake', label: 'Step shake', min: 0, max: 0.006, step: 0.0002 },
];

/** Debug panel: live sliders for the mech's movement numbers, plus copy/reset. */
function tuningPanel(game: Phaser.Game): HTMLElement {
  const panel = el('div', 'tuning');
  const defaults = CHASSIS[STARTER_CHASSIS].movement;
  const movement = (): ChassisMovement | undefined =>
    (game.scene.getScene('Map') as MapScene | null)?.movement;
  const inputs: { key: keyof ChassisMovement; input: HTMLInputElement; out: HTMLElement }[] = [];

  const title = el('div', 'tuning-title');
  title.textContent = `${CHASSIS[STARTER_CHASSIS].name} movement`;
  panel.appendChild(title);

  for (const t of TUNABLES) {
    const row = el('label', 'tuning-row');
    const name = el('span');
    name.textContent = t.label;
    const out = el('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(t.min);
    input.max = String(t.max);
    input.step = String(t.step);
    input.value = String(defaults[t.key]);
    out.textContent = fmt(defaults[t.key]);
    input.addEventListener('input', () => {
      const m = movement();
      if (m) m[t.key] = Number(input.value);
      out.textContent = fmt(Number(input.value));
    });
    row.append(name, input, out);
    panel.appendChild(row);
    inputs.push({ key: t.key, input, out });
  }

  const actionsRow = el('div', 'tuning-actions');
  button(actionsRow, 'Copy values', () => {
    const m = movement();
    if (!m) return;
    const text = JSON.stringify(m, null, 2);
    navigator.clipboard?.writeText(text).then(
      () => flash(actionsRow, 'Copied — paste them to Claude'),
      () => prompt('Copy these values:', text),
    ) ?? prompt('Copy these values:', text);
  });
  button(actionsRow, 'Reset movement', () => {
    const m = movement();
    for (const i of inputs) {
      i.input.value = String(defaults[i.key]);
      i.out.textContent = fmt(defaults[i.key]);
      if (m) m[i.key] = defaults[i.key];
    }
  });
  panel.appendChild(actionsRow);

  // Dev tools for fast playtests.
  const devTitle = el('div', 'tuning-title');
  devTitle.textContent = 'Dev tools';
  devTitle.style.marginTop = '12px';
  const dev = el('div', 'tuning-actions');
  const map = () => game.scene.getScene('Map') as MapScene | null;
  button(dev, 'Win mission', () => map()?.devWin());
  button(dev, 'Spawn tank', () => map()?.devSpawnTank());
  const god = button(dev, 'Invulnerable: off', () => {
    const on = map()?.devToggleInvulnerable();
    god.textContent = `Invulnerable: ${on ? 'on' : 'off'}`;
  });
  button(dev, 'Repair + refill', () => map()?.devRefill());
  button(dev, 'Hit L arm', () => map()?.devDamageSection('leftArm'));
  button(dev, 'Hit R arm', () => map()?.devDamageSection('rightArm'));
  button(dev, 'Hit legs', () => map()?.devDamageSection('legs'));
  button(dev, 'Hit torso', () => map()?.devDamageSection('torso'));
  button(dev, 'New map', () => restartMission(game));
  panel.append(devTitle, dev);
  return panel;
}

/** Start a mission: a new random map, or the same map again with `seed`. */
export function restartMission(game: Phaser.Game, seed?: number): void {
  document.querySelector('.endscreen')?.classList.remove('open');
  const map = game.scene.getScene('Map') as MapScene;
  map.scene.restart({ seed });
  game.scene.getScene('Hud')?.scene.restart();
}

function mountEndScreen(game: Phaser.Game, container: HTMLElement): void {
  const screen = el('div', 'endscreen');
  const card = el('div', 'end-card');
  screen.appendChild(card);
  container.appendChild(screen);

  game.events.on('mission-end', (r: MissionResult) => {
    const mins = Math.floor(r.time / 60);
    const secs = Math.floor(r.time % 60).toString().padStart(2, '0');
    const accuracy = r.shots > 0 ? Math.round((r.hits / r.shots) * 100) : 0;
    card.className = 'end-card ' + (r.won ? 'won' : 'lost');
    card.innerHTML = '';
    const h = el('h1');
    h.textContent = r.won ? 'Mission complete' : 'Mech destroyed';
    const sub = el('p');
    sub.textContent = r.won
      ? 'All uplink towers destroyed. Payment arrives with the economy (milestone 5).'
      : `Mission failed: ${r.targetsDestroyed} of ${r.targetsTotal} uplinks destroyed.`;
    const stats = el('dl');
    const rows: [string, string][] = [
      ['Time', `${mins}:${secs}`],
      ['Enemies destroyed', String(r.kills)],
      ['Damage dealt', String(Math.round(r.damageDealt))],
      ['Damage taken', String(Math.round(r.damageTaken))],
      ['Accuracy', `${accuracy}%  (${r.hits}/${r.shots})`],
      ['Ammo used', String(r.ammoUsed)],
      ['Map seed', String(r.seed)],
    ];
    for (const [k, v] of rows) {
      const dt = el('dt');
      dt.textContent = k;
      const dd = el('dd');
      dd.textContent = v;
      stats.append(dt, dd);
    }
    const actionsRow = el('div', 'end-actions');
    button(actionsRow, 'New mission', () => restartMission(game)).classList.add('primary');
    button(actionsRow, 'Retry this map', () => restartMission(game, r.seed));
    card.append(h, sub, stats, actionsRow);
    screen.classList.add('open');
    play('ui', 1);
  });
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 0.01 ? 4 : 2);
}

function flash(parent: HTMLElement, text: string): void {
  const n = el('div', 'tuning-flash');
  n.textContent = text;
  parent.appendChild(n);
  setTimeout(() => n.remove(), 2000);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function button(parent: HTMLElement, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button');
  b.type = 'button';
  b.textContent = text;
  b.addEventListener('click', () => {
    onClick();
    b.blur(); // keep keyboard input going to the game
  });
  parent.appendChild(b);
  return b;
}
