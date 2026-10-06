import { describe, expect, it } from 'vitest';
import { createApp, sampleReplies } from '../server/app.js';

const fresh = () => {
  const app = createApp({ clientEntry: '/src/entry-client.ts' });
  return {
    get: (path: string) => app.fetch(new Request(`http://localhost${path}`)),
    post: (fields: Record<string, string>) =>
      app.fetch(
        new Request('http://localhost/', { method: 'POST', body: new URLSearchParams(fields) }),
      ),
  };
};

// Re-enable in Phase 4/5 (gyral-g1r.9 / gyral-g1r.10): needs the Gyral server renderer / hydration.
describe.skip('no-js-first server (JavaScript off)', () => {
  it('renders a working form and says JavaScript is off', async () => {
    const body = await (await fresh().get('/')).text();
    expect(body).toMatch(/<form[^>]*action="\/"[^>]*method="post"/);
    expect(body).toMatch(/JavaScript (<!--[^>]*-->)*off/);
    expect(body).toContain('Grace');
    expect(body).not.toContain('grace@example.com'); // emails never reach the page
  });

  it('adds a valid reply and redirects (Post/Redirect/Get)', async () => {
    const { get, post } = fresh();
    const res = await post({ name: 'Ada', email: 'ada@example.com', guests: '2' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/?joined=Ada');
    const after = await (await get('/?joined=Ada')).text();
    expect(after).toMatch(/on the list, <strong>(<!--[^>]*-->)*Ada/);
    expect(after).toMatch(/Who's coming \((<!--[^>]*-->)*6/); // Grace+1, Alan, Ada+2
  });

  it('re-renders a rejected reply with the error and the values kept', async () => {
    const res = await fresh().post({ name: 'Grace H.', email: 'grace@example.com', guests: '0' });
    const body = await res.text();
    expect(res.status).toBe(422);
    expect(body).toContain('Grace already replied with that email.');
    expect(body).toMatch(/id="email"[^>]*aria-invalid="true"/);
    expect(body).toMatch(/id="name"[^>]*value="Grace H\."/);
  });

  it('keeps replies across apps that share them (the dev server makes one per request)', async () => {
    const replies = sampleReplies();
    const appFor = () => createApp({ clientEntry: '/src/entry-client.ts', replies });
    await appFor().fetch(
      new Request('http://localhost/', {
        method: 'POST',
        body: new URLSearchParams({ name: 'Ada', email: 'ada@example.com', guests: '0' }),
      }),
    );
    const after = await (await appFor().fetch(new Request('http://localhost/'))).text();
    expect(after).toContain('Ada');
  });

  it('checks the schema on the server too', async () => {
    const body = await (await fresh().post({ name: ' ', email: 'nope', guests: '9' })).text();
    expect(body).toContain('Enter your name.');
    expect(body).toContain('Enter a valid email address.');
    expect(body).toContain('Choose 0 to 3 guests.');
  });
});
