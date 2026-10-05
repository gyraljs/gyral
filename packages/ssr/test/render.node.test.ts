import { describe, expect, it } from 'vitest';
import { command, define, defineDriver, html } from '@gyral/core';
import { page, renderPage, renderToString, serverHtml } from '../src/index.js';

const runs: string[] = [];
const load = defineDriver<string, string>({
  name: 'load',
  run: (id) => {
    runs.push(id);
    return id;
  },
});

interface Props {
  readonly label: string;
  readonly items: readonly string[];
}
interface State {
  readonly title: string;
  readonly note: string;
}
type Msg = { readonly _tag: 'Loaded'; readonly id: string };

define<State, Msg, Props>('ssr-card', {
  props: { label: { type: String, required: true }, items: { attribute: false, required: true } },
  init: (p) => [
    { title: p.label.toUpperCase(), note: '</script><script>alert(1)</script>' },
    [command(load, p.label, { onSuccess: (id) => ({ _tag: 'Loaded', id }) })],
  ],
  intent: {},
  update: { Loaded: (s) => s },
  view: (s, _i, { props }) => html`
    <h2>${s.title}</h2>
    <ul>
      ${props.items.map((it) => html`<li>${it}</li>`)}
    </ul>
  `,
});

const decode = (attr: string) =>
  attr
    .replaceAll('&quot;', '"')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

function seedOf(out: string): unknown {
  const match = /data-gyral-seed="([^"]*)"/.exec(out);
  if (match?.[1] === undefined) throw new Error('no seed attribute');
  return JSON.parse(decode(match[1]));
}

describe('server rendering (ADR 0012)', () => {
  it('renders define() elements as Declarative Shadow DOM from init(props)', async () => {
    const out = await renderToString(html`<ssr-card label="hi" .items=${['a', 'b']}></ssr-card>`);
    expect(out).toContain('<template shadowroot="open" shadowrootmode="open">');
    expect(out).toMatch(/<h2>(<!--[^>]*-->)*HI(<!--[^>]*-->)*<\/h2>/);
    expect(out).toMatch(/<li>(<!--[^>]*-->)*a/);
  });

  it('seeds state and only the props an attribute cannot carry', async () => {
    const out = await renderToString(html`<ssr-card label="hi" .items=${['a']}></ssr-card>`);
    expect(seedOf(out)).toEqual({
      state: { title: 'HI', note: '</script><script>alert(1)</script>' },
      props: { items: ['a'] },
    });
  });

  it('escapes the seed: hostile state cannot break out of the attribute', async () => {
    const out = await renderToString(html`<ssr-card label="x" .items=${[]}></ssr-card>`);
    expect(out).not.toContain('<script>alert(1)');
  });

  it('never runs commands on the server', async () => {
    runs.length = 0;
    await renderToString(html`<ssr-card label="hi" .items=${[]}></ssr-card>`);
    expect(runs).toEqual([]);
  });

  it('wraps the body in a server-only document shell', async () => {
    const out = await renderToString(
      page({
        title: 'A <b> title',
        description: 'About us',
        head: serverHtml`<link rel="icon" href="/favicon.ico">`,
        body: html`<ssr-card label="p" .items=${[]}></ssr-card>`,
        scripts: ['/src/entry-client.ts'],
      }),
    );
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out).toContain('<html lang="en" dir="ltr">');
    expect(out).toContain('<title>A &lt;b&gt; title</title>');
    expect(out).toContain('<meta name="description" content="About us">');
    expect(out).toContain('<script type="module" src="/src/entry-client.ts"></script>');
    expect(out).toMatch(/<ssr-card\s+label="p"/);
  });

  it('streams a full page as an HTML Response', async () => {
    const res = renderPage({ title: 't', body: html`<p>hello</p>` }, { status: 404 });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('<p>hello</p>');
  });
});
