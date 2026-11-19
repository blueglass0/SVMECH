/**
 * Tiny synthesized sound effects (Web Audio, no files). Sounds are generated
 * from noise and oscillators, so they cost almost nothing to load. Browsers
 * only allow audio after a user gesture, so the context starts on the first
 * key press or touch.
 */
import { settings, saveSettings } from './settings';

export type SoundId = 'mg' | 'cannon' | 'laser' | 'missile' | 'flare' | 'shield' | 'lock' | 'hit' | 'explode' | 'bigExplode' | 'warn' | 'ui';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
/** Last play time per sound, to stop rapid-fire weapons stacking into noise. */
const last: Partial<Record<SoundId, number>> = {};
const MIN_GAP: Partial<Record<SoundId, number>> = { mg: 0.045, hit: 0.05, cannon: 0.04, warn: 0.3, missile: 0.08, lock: 0.25 };

function init(): void {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = settings.muted ? 0 : 0.35;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/** Call once at startup: unlocks audio on the first user gesture. */
export function installAudioUnlock(): void {
  const unlock = () => {
    init();
    void ctx?.resume();
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
}

export function setMuted(muted: boolean): void {
  settings.muted = muted;
  saveSettings();
  if (master) master.gain.value = muted ? 0 : 0.35;
}

/** Play a sound at a volume of 0..1 (callers scale by distance). */
export function play(id: SoundId, volume = 1): void {
  if (!ctx || !master || !noise || settings.muted || volume <= 0.02 || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const gap = MIN_GAP[id] ?? 0.02;
  if ((last[id] ?? -1) > now - gap) return;
  last[id] = now;
  const v = Math.min(1, volume);
  switch (id) {
    case 'mg':
      burst(now, 0.05, 2500, 'bandpass', 0.35 * v, 1.2);
      break;
    case 'cannon':
      burst(now, 0.16, 900, 'lowpass', 0.6 * v);
      tone(now, 'sine', 140, 50, 0.14, 0.5 * v);
      break;
    case 'laser':
      tone(now, 'sawtooth', 1400, 260, 0.18, 0.18 * v);
      tone(now, 'square', 700, 180, 0.14, 0.08 * v);
      break;
    case 'missile':
      burst(now, 0.35, 1200, 'bandpass', 0.45 * v, 0.8);
      tone(now, 'sawtooth', 160, 420, 0.3, 0.08 * v);
      break;
    case 'flare':
      burst(now, 0.25, 3000, 'highpass', 0.35 * v);
      tone(now, 'square', 1200, 600, 0.15, 0.06 * v);
      break;
    case 'shield':
      tone(now, 'sine', 220, 660, 0.35, 0.25 * v);
      tone(now, 'triangle', 330, 990, 0.35, 0.12 * v);
      break;
    case 'lock':
      tone(now, 'square', 1500, 1500, 0.05, 0.06 * v);
      break;
    case 'hit':
      burst(now, 0.04, 3500, 'highpass', 0.25 * v);
      break;
    case 'explode':
      burst(now, 0.45, 600, 'lowpass', 0.8 * v);
      tone(now, 'sine', 90, 30, 0.35, 0.6 * v);
      break;
    case 'bigExplode':
      burst(now, 0.9, 400, 'lowpass', 1 * v);
      tone(now, 'sine', 70, 25, 0.8, 0.8 * v);
      break;
    case 'warn':
      tone(now, 'square', 880, 880, 0.08, 0.12 * v);
      break;
    case 'ui':
      tone(now, 'triangle', 660, 990, 0.06, 0.12 * v);
      break;
  }
}

function burst(t: number, dur: number, freq: number, type: BiquadFilterType, gain: number, q = 0.7): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.2, dur);
}

function tone(t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number): void {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur);
}
