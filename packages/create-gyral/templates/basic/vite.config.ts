import { defineConfig } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';

// gyralVitePreset(): the template compiler (`vite build` checks and precompiles templates).
//
// clientOnly: true: this app renders only in the browser, so builds leave out Gyral's
// hydration code (about 1 KiB gzip). Vitest reuses this config (vitest.config.ts), so tests
// run the same way.
//
// Turn it off (delete `clientOnly: true`) as soon as any page is rendered on a server or
// prerendered, for example when you add @gyral/ssr. With it on, server-rendered components
// can't hydrate: they render again from scratch, and development builds warn.
// https://gyral.dev/docs/server-rendering/
export default defineConfig({ ...gyralVitePreset({ clientOnly: true }) });
