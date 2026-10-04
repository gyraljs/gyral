import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: ['scripts/test/**/*.test.mjs'],
          environment: 'node',
        },
      },
    ],
  },
});
