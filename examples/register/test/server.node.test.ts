import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';

const app = createApp({ clientEntry: '/src/entry-client.ts' });
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));
const post = (fields: Record<string, string>) =>
  app.fetch(
    new Request('http://localhost/', { method: 'POST', body: new URLSearchParams(fields) }),
  );

const valid = {
  name: 'mike',
  email: 'mike@example.com',
  password: 'longenough',
  confirm: 'longenough',
};
// Passes the native constraints, fails the schema: taken name (async check) + mismatch.
const rejected = { ...valid, name: 'admin', confirm: 'different!' };

const seedOf = (body: string): unknown => {
  const raw = /data-gyral-seed="([^"]*)"/.exec(body)?.[1] ?? '';
  return JSON.parse(raw.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
};

describe('register server (no-JS path)', () => {
  it('renders a real form that posts back to itself', async () => {
    const res = await get('/');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toMatch(/<form[^>]*action="\/"[^>]*method="post"/);
  });

  it('redirects a valid submission (Post/Redirect/Get)', async () => {
    const res = await post(valid);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/?welcome=mike');
    const after = await (await get('/?welcome=mike')).text();
    expect(after).toMatch(/Welcome, <strong>(<!--[^>]*-->)*mike/);
  });

  it('re-renders an invalid submission with errors, through the async schema', async () => {
    const res = await post(rejected);
    const body = await res.text();
    expect(res.status).toBe(422);
    expect(body).toContain('That name is taken.');
    expect(body).toContain('The passwords do not match.');
    expect(body).toMatch(/id="confirm"[^>]*aria-invalid="true"/);
  });

  it('re-fills text fields but never passwords', async () => {
    const body = await (await post(rejected)).text();
    expect(body).toMatch(/id="email"[^>]*value="mike@example.com"/);
    expect(body).not.toContain('longenough');
    expect(body).not.toContain('different!');
  });

  it('seeds the rejected state so hydration renders the same errors', async () => {
    const body = await (await post(rejected)).text();
    expect(seedOf(body)).toMatchObject({
      state: {
        values: { name: 'admin', email: 'mike@example.com' },
        errors: { name: ['That name is taken.'], confirm: ['The passwords do not match.'] },
      },
    });
  });

  it('refuses requests that are not form submissions', async () => {
    const res = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(415);
  });

  it('produces the markup the hydration and parity tests use', async () => {
    // Golden file consumed by the browser tests. Regenerate with `pnpm test -u`.
    await expect(await (await post(rejected)).text()).toMatchFileSnapshot(
      './fixtures/rejected.ssr.html',
    );
  });
});
