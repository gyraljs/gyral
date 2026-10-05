import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { gyralVitePreset } from './packages/core/src/vite.js';

export default defineConfig({
  test: {
    projects: [
      {
        // One Lit copy, and Lit's modules pre-bundled so the first browser run doesn't
        // discover them mid-test and reload (gyral-a7r).
        ...gyralVitePreset(),
        test: {
          name: 'browser',
          include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
          // Server-rendering tests run in Node (the `node` project below).
          exclude: ['**/*.node.test.ts', '**/node_modules/**'],
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
          include: [
            'scripts/test/**/*.test.mjs',
            'packages/*/test/**/*.node.test.ts',
            'examples/*/test/**/*.node.test.ts',
          ],
          environment: 'node',
        },
      },
    ],
  },
});
