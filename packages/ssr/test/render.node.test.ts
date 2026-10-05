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
type Msg =
  | { readonly _tag: 'Loaded'; readonly id: string }
  | { readonly _tag: 'Noted'; readonly text: string };

const HOSTILE = '</script><script>alert(1)</script>';

define<State, Msg, Props>('ssr-card', {
  props: { label: { type: String, required: true }, items: { attribute: false, required: true } },
  init: (p) => [
    { title: p.label.toUpperCase(), note: '' },
    [command(load, p.label, { onSuccess: (id) => ({ _tag: 'Loaded', id }) })],
  ],
  intent: {},
  update: { Loaded: (s) => s, Noted: (s, m) => ({ ...s, note: m.text }) },
  view: (s, _i, { props }) => html`
    <h2>${s.title}</h2>
    <ul>
      ${props.items.map((it) => html`<li>${it}</li>`)}
    </ul>
  `,
});

// State copied from props: the case seed deduplication exists for.
define<{ readonly items: readonly string[] }, never, { readonly items: readonly string[] }>(
  'ssr-copy',
  {
    props: { items: { attribute: false, required: true } },
    init: (p) => ({ items: p.items }),
    intent: {},
    update: {},
    view: (s) => html`<p>${String(s.items.length)}</p>`,
  },
);

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

  it('seeds only the props an attribute cannot carry, and no state equal to init(props)', async () => {
    const out = await renderToString(html`<ssr-card label="hi" .items=${['a']}></ssr-card>`);
    expect(seedOf(out)).toEqual({ props: { items: ['a'] } });
  });

  it('seeds state that differs from init(props)', async () => {
    const noted = [{ _tag: 'Noted', text: 'kept' }];
    const out = await renderToString(
      html`<ssr-card label="hi" .items=${['a']} .initialMessages=${noted}></ssr-card>`,
    );
    expect(seedOf(out)).toEqual({ state: { title: 'HI', note: 'kept' }, props: { items: ['a'] } });
  });

  it('escapes the seed: hostile state cannot break out of the attribute', async () => {
    const noted = [{ _tag: 'Noted', text: HOSTILE }];
    const out = await renderToString(
      html`<ssr-card label="x" .items=${[]} .initialMessages=${noted}></ssr-card>`,
    );
    expect(JSON.stringify(seedOf(out))).toContain(HOSTILE);
    expect(out).not.toContain('<script>alert(1)');
  });

  it('halves the seed when state is copied from props (gyral-4k7.10)', async () => {
    const items = Array.from({ length: 200 }, (_, n) => `product number ${String(n)}`);
    const out = await renderToString(html`<ssr-copy .items=${items}></ssr-copy>`);
    const match = /data-gyral-seed="([^"]*)"/.exec(out);
    const seed = decode(match?.[1] ?? '');
    const payload = JSON.stringify(items).length;
    expect(seed.length).toBeLessThan(payload * 1.1); // once, not twice
    expect(seedOf(out)).toEqual({ props: { items } });
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

  it('writes global styles into the head, escaping an early </style>', async () => {
    const out = await renderToString(
      page({
        title: 't',
        body: html`<p>x</p>`,
        styles: ['body { color: red; }', 'p::after { content: "</STYLE><script>x()</script>"; }'],
      }),
    );
    const head = out.slice(0, out.indexOf('</head>'));
    expect(head).toContain('<style>body { color: red; }</style>');
    expect(head).toContain('content: "<\\/STYLE><script>x()</script>"; }</style>');
    expect(out.match(/<\/style>/gi)).toHaveLength(2);
  });

  it('streams a full page as an HTML Response', async () => {
    const res = renderPage({ title: 't', body: html`<p>hello</p>` }, { status: 404 });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('<p>hello</p>');
  });
});
