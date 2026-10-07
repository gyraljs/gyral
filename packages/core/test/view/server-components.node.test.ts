// view/06-server.md "Components", "API" and "CSP": Gyral components rendered in place from
// their specs (props, init, initialMessages, view), shadow and light output, seeds, islands,
// chunk boundaries, and the style hashes.
import { createHash } from 'node:crypto';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it, vi } from 'vitest';
import { ISLAND_ATTRIBUTE, LIGHT_ATTRIBUTE, css, define, html, prop } from '../../src/index.js';
import { SEED_ATTRIBUTE } from '../../src/hydration.js';
import * as written from '../../src/view/attributes.js';
import { render, renderToString, styleHashes } from '../../src/server.js';

const list: StandardSchemaV1<readonly string[]> = {
  '~standard': { version: 1, vendor: 't', validate: (v) => ({ value: v as readonly string[] }) },
};

type Msg = { readonly _tag: 'Add'; readonly n: number };
interface Props {
  readonly start: number;
  readonly label: string;
  readonly open: boolean;
  readonly tags: readonly string[];
}

define<{ readonly count: number }, Msg, Props>('srv-counter', {
  props: {
    start: prop.number({ default: 0 }),
    label: prop.string({ default: '' }),
    open: prop.boolean(),
    tags: prop.value(list, { default: [] }),
  },
  init: (p) => ({ count: p.start }),
  intent: {},
  update: { Add: (s, m) => ({ count: s.count + m.n }) },
  view: (s, _i, { props }) =>
    html`<p>${props.label}: ${s.count} ${props.open ? 'open' : 'shut'} ${props.tags.join()}</p>`,
  styles: [
    css`
      p {
        color: red;
      }
    `,
    'b::after { content: "</style>"; }',
  ],
});

define<{ readonly n: number }, never>('srv-light', {
  shadow: false,
  init: () => ({ n: 1 }),
  intent: {},
  update: {},
  view: (s) =>
    html`<section>
      <h2>Light ${s.n}</h2>
      <srv-counter start="2"></srv-counter>
    </section>`,
});

define<{ readonly n: number }, never>('srv-island', {
  hydrate: 'visible',
  init: () => ({ n: 0 }),
  intent: {},
  update: {},
  view: () => html`<i>later</i>`,
});

const prod = (v: unknown) => renderToString(v as never, { dev: false });

/** The seed attribute's JSON, decoded (single-quoted; only & and ' escaped). */
const seeds = (out: string): unknown[] =>
  [...out.matchAll(/data-gyral-seed='([^']*)'/g)].map(
    (m) =>
      JSON.parse(
        (m[1] ?? '')
          .replaceAll('&#39;', "'")
          .replaceAll('&lt;', '<')
          .replaceAll('&gt;', '>')
          .replaceAll('&amp;', '&'),
      ) as unknown,
  );

describe('components (06 "Components")', () => {
  it('render shadow components as declarative shadow roots with their CSS first', () => {
    const out = prod(html`<srv-counter start="3" label="A&amp;B"></srv-counter>`);
    expect(out).toBe(
      `<srv-counter start="3" label="A&amp;B" data-gyral-seed='{"props":{}}'>` +
        '<template shadowrootmode="open"><style>\n      p {\n        color: red;\n      }\n    ' +
        '\nb::after { content: "<\\/style>"; }</style>' +
        '<p>A&amp;B<!---->: 3<!----> shut<!----> </p></template></srv-counter>',
    );
  });

  it('parse props from static attributes and attribute/boolean holes, like the browser', () => {
    const out = prod(html`<srv-counter start=${'7'} ?open=${true} label=${null}></srv-counter>`);
    expect(out).toContain('<srv-counter start="7" open data-gyral-seed=');
    expect(out).toContain('<p><!---->: 7<!----> open');
  });

  it('report an invalid attribute and fall back to the default', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(prod(html`<srv-counter start="many"></srv-counter>`)).toContain('<p><!---->: 0<!---->');
    expect([...error.mock.calls, ...warn.mock.calls].join(' ')).toMatch(/srv-counter.*start/);
    error.mockRestore();
    warn.mockRestore();
  });

  it("carry property-hole props and changed state in the seed, escaping & ' < >", () => {
    const tags = [`it's`, 'a&b', '"q"', '</script>'];
    const out = prod(
      html`<srv-counter .tags=${tags} .initialMessages=${[{ _tag: 'Add', n: 2 }]}></srv-counter>`,
    );
    expect(out).toContain(`data-gyral-seed='{"state":{"count":2},"props":{"tags":["it&#39;s"`);
    expect(out).toContain(`"&lt;/script&gt;"]}}'`);
    expect(seeds(out)).toEqual([{ state: { count: 2 }, props: { tags } }]);
    expect(out).toContain(`it's,a&amp;b,"q",&lt;/script&gt;</p>`); // text escapes only & < >
  });

  it('write parent-provided children after the shadow root', () => {
    const out = prod(html`<srv-counter><b slot="x">kid</b></srv-counter>`);
    expect(out).toMatch(/<\/template><b slot="x">kid<\/b><\/srv-counter>$/);
  });

  it('render light components as their own children, marked data-gyral-light', () => {
    const out = prod(html`<srv-light></srv-light>`);
    expect(out).toMatch(
      /^<srv-light data-gyral-light data-gyral-seed='\{"props":\{\}\}'><section><h2>Light 1<\/h2><srv-counter start="2" data-gyral-seed=/,
    );
    expect(out).toMatch(/<\/srv-counter><\/section><\/srv-light>$/);
  });

  it('refuse children given to a light component (ADR 0014); whitespace is dropped', () => {
    expect(() => prod(html`<srv-light><p>no</p></srv-light>`)).toThrow(/owns its children/);
    expect(() => prod(html`<srv-light>${html`<srv-counter></srv-counter>`}</srv-light>`)).toThrow(
      /owns its children/,
    );
    expect(prod(html`<srv-light>${' '}</srv-light>`)).toMatch(/<\/section><\/srv-light>$/);
  });

  it('defer islands with defer-hydration and their strategy', () => {
    expect(prod(html`<srv-island></srv-island>`)).toContain(
      `<srv-island data-gyral-seed='{"props":{}}' defer-hydration data-gyral-hydrate="visible">`,
    );
  });

  it('write unregistered custom elements as plain elements', () => {
    expect(prod(html`<other-el a="1" b=${2} .c=${3}>${'x'}</other-el>`)).toBe(
      '<other-el a="1" b="2">x</other-el>',
    );
  });

  it('put development markers inside roots, before each view instance', () => {
    const out = renderToString(html`<srv-island></srv-island>`, { dev: true });
    expect(out).toMatch(/<template shadowrootmode="open"><!--gyral:[0-9a-z]+--><i>later<\/i>/);
  });
});

describe('host attributes', () => {
  it('are spelled the same by the server renderer and the client', () => {
    expect({ ...written }).toEqual({ SEED_ATTRIBUTE, LIGHT_ATTRIBUTE, ISLAND_ATTRIBUTE });
  });
});

describe('streaming (06 "API")', () => {
  it('yields at every component boundary and renders each component only when pulled', () => {
    let rendered = 0;
    define<{ readonly n: number }, never>('srv-counted', {
      init: () => {
        rendered++;
        return { n: rendered };
      },
      intent: {},
      update: {},
      view: (s) => html`<b>${s.n}</b>`,
    });
    const chunks = render(
      html`<main><srv-counted></srv-counted><srv-counted></srv-counted></main>`,
      { dev: false },
    )[Symbol.iterator]();
    expect(chunks.next().value).toBe('<main><srv-counted');
    expect(rendered).toBe(0);
    expect(chunks.next().value).toMatch(/^ data-gyral-seed=.*<b>1<\/b><\/template>$/);
    expect(rendered).toBe(1);
    expect(chunks.next().value).toBe('</srv-counted><srv-counted');
    expect(rendered).toBe(1);
    expect(chunks.next().value).toMatch(/<b>2<\/b>/);
    expect(chunks.next().value).toBe('</srv-counted></main>');
    expect(chunks.next().done).toBe(true);
  });
});

describe('style hashes (06 "CSP")', () => {
  it("hash each shadow component's <style> text as written, with SHA-256", async () => {
    const out = prod(html`<srv-counter></srv-counter>`);
    const text = /<style>([\s\S]*?)<\/style>/.exec(out)?.[1] ?? '';
    const expected = `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
    const hashes = await styleHashes();
    expect(hashes).toContain(expected);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});
