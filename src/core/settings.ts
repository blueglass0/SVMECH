/**
 * Player preferences, kept in localStorage. Storage can be unavailable
 * (private mode, blocked site data), so every access is guarded and the
 * game falls back to defaults.
 */
export type ControlScheme = 'tank' | 'direction';
export type InputDevice = 'kbm' | 'touch';
/**
 * Phone firing with the right stick: 'tiers' (default) fires group 1 past the inner ring and
 * both groups when the thumb goes past the stick's edge; 'swap' fires the selected group (a
 * button switches it); 'both' fires every weapon past the ring.
 */
export type TouchFire = 'tiers' | 'swap' | 'both';

export interface Settings {
  /** Movement scheme per input device. */
  scheme: Record<InputDevice, ControlScheme>;
  muted: boolean;
  /** Fog of war look: 'faded' keeps terrain dimly visible outside your vision, 'dark' hides it. */
  fog: 'faded' | 'dark';
  /** Master volume 0..1. */
  volume: number;
  /** 'low' renders fewer pixels and fewer particles, for weak phones and laptops. */
  quality: 'high' | 'low';
  /** Camera shake from footsteps, hits and landings. */
  shake: boolean;
  /** Small frame-rate readout in the corner. */
  showFps: boolean;
  touchFire: TouchFire;
  /** Size of the phone buttons around the right stick (0.8..1.3). */
  buttonScale: number;
}

const KEY = 'steel-vulture.settings.v1';

function defaults(): Settings {
  return {
    scheme: { kbm: 'tank', touch: 'direction' },
    muted: false,
    fog: 'faded',
    volume: 0.8,
    quality: 'high',
    shake: true,
    showFps: false,
    touchFire: 'tiers',
    buttonScale: 1,
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...defaults(), ...parsed, scheme: { ...defaults().scheme, ...parsed.scheme } };
  } catch {
    return defaults();
  }
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not fatal: the setting just won't survive a reload.
  }
}
