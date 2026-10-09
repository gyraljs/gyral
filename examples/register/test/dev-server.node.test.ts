// gyral-abk: the dev server re-loads the app module per request; registered emails must
// survive that, or the duplicate-email check never fires in dev. gyralDevServer creates the
// state once and hands it to every per-request app, as this does.
import { expect, it } from 'vitest';
import { createApp, createState } from '../server/app.js';

const state = createState();
// Every request builds a new app, as the dev server does after a reload.
const handle = (request: Request) => createApp({ state }).fetch(request);

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

it('keeps registered emails across per-request apps, so a duplicate is rejected', async () => {
  expect((await register()).status).toBe(303);
  const again = await register();
  expect(again.status).toBe(422);
  expect(await again.text()).toContain('That email is already registered.');
});
