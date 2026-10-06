// The view layer's in-browser benchmarks (not part of `pnpm check`): `pnpm bench:view`.
// Production conditions: core's `#view-dev` resolves to dev-off.ts and lit-html (the
// black-box baseline) to its production build, so neither pays for development checks.
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['module', 'browser', 'production'] },
  // Cross-origin isolation gives performance.now() microsecond resolution.
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  test: {
    include: ['packages/core/bench/**/*.bench.test.ts'],
    testTimeout: 600_000,
    silent: false,
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
