// The style-attribute tests in Chromium, Firefox and WebKit (not part of `pnpm check`, which
// runs Chromium only): `pnpm vitest run --config packages/core/test/view/browsers.config.ts`.
// Firefox is the browser that blocks a static `style` in a <template>'s HTML under a strict
// CSP (view/08-styles.md "Style attributes under a strict CSP").
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { gyralVitePreset } from '../../src/vite.js';

export default defineConfig({
  ...gyralVitePreset(),
  test: {
    include: [
      'packages/core/test/view/{render-style,style-hydration,style-csp}.test.ts',
      'packages/ssr/test/style-attribute-hashes.test.ts',
    ],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
});
