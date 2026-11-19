import { defineConfig } from 'vite';

// Short commit hash shown in the HUD so playtest reports can name the exact build.
const buildId = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);

export default defineConfig({
  // Relative base so the build works at any GitHub Pages path (/<repo>/) and locally.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  build: {
    // ES2020 keeps the game running on older phones and browsers (e.g. iOS 14+ Safari).
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        // Phaser in its own chunk: it rarely changes, so browsers keep it cached between deploys.
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules[\\/]phaser/ }],
        },
      },
    },
  },
});
