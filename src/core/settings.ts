/**
 * Player preferences, kept in localStorage. Storage can be unavailable
 * (private mode, blocked site data), so every access is guarded and the
 * game falls back to defaults.
 */
export type ControlScheme = 'tank' | 'direction';
export type InputDevice = 'kbm' | 'touch';

export interface Settings {
  /** Movement scheme per input device. */
  scheme: Record<InputDevice, ControlScheme>;
  muted: boolean;
}

const KEY = 'steel-vulture.settings.v1';

function defaults(): Settings {
  return { scheme: { kbm: 'tank', touch: 'direction' }, muted: false };
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
