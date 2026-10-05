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
        // The hydration tests again, against Lit's PRODUCTION build (gyral-czi.38). Lit renames
        // private fields in production, so code that touches Lit internals can pass in
        // development and break in shipped apps. No `development` export condition here.
        ...gyralVitePreset(),
        resolve: {
          ...gyralVitePreset().resolve,
          conditions: ['module', 'browser', 'production'],
        },
        test: {
          name: 'browser-prod',
          include: ['packages/*/test/**/*-hydration.test.ts', 'packages/*/test/**/*.prod.test.ts'],
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
