import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { gyralVitePreset } from './packages/core/src/vite.js';

export default defineConfig({
  test: {
    projects: [
      {
        // The Gyral preset (gyral-a7r): the template compiler (which applies to `vite build`
        // only, so tests use the runtime template path) and the dev-server SSR plugin.
        ...gyralVitePreset(),
        test: {
          name: 'browser',
          include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
          // Server-rendering tests run in Node (the `node` project below).
          exclude: ['**/*.node.test.ts', '**/*.prod.test.ts', '**/node_modules/**'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        // The hydration tests again, against core's PRODUCTION build (no `development` export
        // condition: `#view-dev` and `#devtools` resolve to their production modules), so
        // behaviour that differs between builds is covered (view/07-hydration.md "Testing"):
        // every package's and example's hydration tests.
        ...gyralVitePreset(),
        resolve: { conditions: ['module', 'browser', 'production'] },
        test: {
          name: 'browser-prod',
          include: [
            'packages/*/test/**/*-hydration.test.ts',
            'packages/*/test/**/*.prod.test.ts',
            'examples/*/test/**/*hydration*.test.ts',
          ],
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
