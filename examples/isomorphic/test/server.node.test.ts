import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';

const app = createApp({ clientEntry: '/src/entry-client.ts' });
const get = (path: string) => app.fetch(new Request(`http://localhost${path}`));

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('isomorphic server', () => {
  it('server-renders the page as Declarative Shadow DOM, readable without JavaScript', async () => {
    const res = await get('/about');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<title>Read more about us — Gyral isomorphic</title>');
    expect(body).toContain('shadowrootmode="open"');
    expect(body).toMatch(/<h1>(<!--[^>]*-->)*Read more about us/);
    expect(body).toMatch(/aria-current="(<!--[^>]*-->)*page"/);
    expect(body).toContain('<script type="module" src="/src/entry-client.ts"></script>');
  });

  it('answers unknown paths with 404 and a rendered not-found page', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/Unknown page <code>(<!--[^>]*-->)*\/nope/);
  });

  it('produces the markup the hydration test uses', async () => {
    // Golden file consumed by hydration.test.ts. Regenerate with `pnpm test -u`.
    const body = await (await get('/about')).text();
    await expect(body).toMatchFileSnapshot('./fixtures/about.ssr.html');
  });
});
