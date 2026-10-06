// gyral-abk: the dev server re-loads the app module per request; registered emails must
// survive that, or the duplicate-email check never fires in dev.
import { expect, it } from 'vitest';
import { devFetch } from '../../shared/dev-fetch.js';
import * as appModule from '../server/app.js';

const handle = devFetch(
  // Stands in for vite.ssrLoadModule; every request still builds a new app from the module.
  () => Promise.resolve(appModule),
  (mod) => mod.createState(),
  (mod, state) => mod.createApp({ clientEntry: '/src/entry-client.ts', state }),
);

const register = () =>
  handle(
    new Request('http://localhost/', {
      method: 'POST',
      body: new URLSearchParams({
        name: 'grace',
        email: 'grace@example.com',
        password: 'longenough',
        confirm: 'longenough',
      }),
    }),
  );

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
it.skip('keeps registered emails across per-request apps, so a duplicate is rejected', async () => {
  expect((await register()).status).toBe(303);
  const again = await register();
  expect(again.status).toBe(422);
  expect(await again.text()).toContain('That email is already registered.');
});
