import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp({ clientEntry: '/src/entry-client.ts' });

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('server rendering', () => {
  it('renders the home page on the server', async () => {
    const response = await app.fetch(new Request('http://localhost/'));
    expect(response.status).toBe(200);
    const page = await response.text();
    // The light-DOM page content is plain HTML...
    expect(page).toContain('<h1>Hello, Gyral</h1>');
    // ...and the counter widget is Declarative Shadow DOM, already showing its start value.
    expect(page).toContain('shadowrootmode="open"');
    expect(page.replace(/<!--.*?-->/g, '')).toContain('aria-live="polite">3</output>');
  });

  it('answers unknown paths with 404', async () => {
    const response = await app.fetch(new Request('http://localhost/missing'));
    expect(response.status).toBe(404);
  });
});
