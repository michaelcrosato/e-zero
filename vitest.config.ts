import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests cover the DOM-free layer: maths, RNG, track geometry and the
    // rival field. Anything that touches canvas or the DOM is covered by the
    // Playwright suite against a real browser instead.
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/core/**', 'src/track/spline.ts', 'src/track/layout.ts', 'src/sim/rivals.ts'],
      reporter: ['text', 'html'],
    },
  },
});
