/**
 * Display and performance settings. These are the knobs that keep the game
 * light enough for low-end PCs and mid-range phones. Tune here, not in scenes.
 */
export const DISPLAY = {
  /**
   * Highest device-pixel-ratio we render at. Phones report 2-3; rendering at 3x
   * costs 2.25x the pixels of 2x for a barely visible difference.
   */
  maxPixelRatio: 2,

  /**
   * Hard cap on canvas backing pixels (width * height). ~1080p. On large or
   * high-DPI screens the canvas renders below native resolution and is
   * stretched, which keeps fill-rate cost flat on weak GPUs.
   */
  maxRenderPixels: 1920 * 1080,

  /**
   * Never render below this fraction of CSS resolution, however big the screen.
   */
  minRenderScale: 0.5,

  /**
   * World units visible along the screen's shorter side. Makes the visible
   * play area the same on every screen regardless of resolution.
   */
  viewShortAxis: 720,

  /**
   * Phones (screens whose short side is under `smallScreenCss` CSS px) see a
   * little less of the map so the mech isn't tiny: 640 makes everything
   * ~12% bigger than on PC.
   */
  viewShortAxisSmall: 640,
  smallScreenCss: 600,

  /** Background (clear) colour. */
  background: 0x0b0e11,
} as const;
