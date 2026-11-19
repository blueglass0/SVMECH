/**
 * Debug overlay switch: on in the dev server, or on a deployed build with
 * `?debug` in the URL. Later milestones hang the dev menu off this too.
 */
export const DEBUG =
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

/** Values game scenes publish for the debug overlay to show. */
export const debugInfo: Record<string, string> = {};
