// view/06-server.md "CSP": the page helper's Content-Security-Policy allows every shadow
// component's declarative-shadow-root <style> and the page's global styles by hash.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { css, define, html } from '@gyral/core';
import { registryVersion } from '@gyral/core/server';
import { contentSecurityPolicy, renderPage, renderToString } from '../src/index.js';

define<{ readonly n: number }, never>()('csp-styled', {
  init: () => ({ n: 0 }),
  intent: {},
  update: {},
  view: () => html`<p>styled</p>`,
  styles: css`
    p {
      color: rgb(1, 2, 3);
    }
  `,
});

/** A shadow component with its own CSS, defined when called (late registration). */
const styled = (tag: string, color: string) =>
  define<{ readonly n: number }, never>()(tag, {
    init: () => ({ n: 0 }),
    intent: {},
    update: {},
    view: () => html`<p>${tag}</p>`,
    styles: css`
      p {
        color: ${color};
      }
    `,
  });

const sha = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const styleOf = (out: string) => /<style>([\s\S]*?)<\/style>/.exec(out)?.[1] ?? '';

describe('contentSecurityPolicy (view/06-server.md "CSP")', () => {
  it("lists the hash of each shadow component's <style> in style-src, after 'self'", async () => {
    const out = await renderToString(html`<csp-styled></csp-styled>`);
    const policy = await contentSecurityPolicy();
    expect(policy).toMatch(/^style-src 'self' /);
    expect(policy).toContain(sha(styleOf(out)));
  });

  it("hashes the page's global styles as written, </style> escaped", async () => {
    const styles = ['body { margin: 0 }', 'a::after { content: "</style>" }'];
    const policy = await contentSecurityPolicy({ styles });
    expect(policy).toContain(sha('body { margin: 0 }'));
    expect(policy).toContain(sha('a::after { content: "<\\/style>" }'));
  });

  it('keeps other directives and appends hashes to a given style-src', async () => {
    const policy = await contentSecurityPolicy({
      directives: { 'default-src': "'self'", 'style-src': ["'self'", 'https://cdn.example'] },
    });
    expect(policy).toMatch(/^default-src 'self'; style-src 'self' https:\/\/cdn\.example 'sha256-/);
  });

  it('is set as a header by renderPage({ csp })', async () => {
    const csp = await contentSecurityPolicy();
    const res = renderPage({ title: 't', body: html`<csp-styled></csp-styled>`, csp });
    expect(res.headers.get('content-security-policy')).toBe(csp);
    expect(await res.text()).toContain('<template shadowrootmode="open"><style>');
  });
});

describe('renderPage({ csp: options }) builds the header at render time', () => {
  it('includes components registered after the options were made, and the page styles', async () => {
    const options = { directives: { 'default-src': "'self'" } };
    styled('csp-late', 'rgb(4, 5, 6)'); // registers after `options` exists
    const styles = 'body { margin: 0 }';
    const res = renderPage({ title: 't', styles, body: html`<csp-late></csp-late>`, csp: options });
    const header = res.headers.get('content-security-policy') ?? '';
    const out = await res.text();
    expect(header).toMatch(/^default-src 'self'; style-src 'self' /);
    expect(header).toContain(sha(styleOf(out.slice(out.indexOf('<csp-late')))));
    expect(header).toContain(sha(styles));
  });

  it('caches the header per options object until another component registers', () => {
    const options = {};
    const page = () =>
      renderPage({ title: 't', body: html`<p>x</p>`, csp: options }).headers.get(
        'content-security-policy',
      ) ?? '';
    const first = page();
    expect(page()).toBe(first);
    styled('csp-later', 'rgb(7, 8, 9)');
    const next = page();
    expect(next).not.toBe(first);
    expect(next.startsWith(first)).toBe(true); // one more hash
  });
});

describe('the registry version the cache keys on (gyral-g1r.23)', () => {
  it('changes with every registration, light components included, and not on a repeat', () => {
    const before = registryVersion();
    define<{ readonly n: number }, never>()('csp-light', {
      shadow: false,
      init: () => ({ n: 0 }),
      intent: {},
      update: {},
      view: () => html`<p>light</p>`,
    });
    const afterLight = registryVersion();
    expect(afterLight).toBeGreaterThan(before);
    styled('csp-versioned', 'rgb(20, 21, 22)');
    const afterStyled = registryVersion();
    expect(afterStyled).toBeGreaterThan(afterLight);
    styled('csp-versioned', 'rgb(23, 24, 25)'); // same tag: the first definition is kept
    expect(registryVersion()).toBe(afterStyled);
  });

  it('rebuilds the cached header after any registration, and keeps hashes in sync', async () => {
    const options = {};
    const header = () =>
      renderPage({ title: 't', body: html`<p>x</p>`, csp: options }).headers.get(
        'content-security-policy',
      ) ?? '';
    const first = header();
    define<{ readonly n: number }, never>()('csp-light-2', {
      shadow: false,
      init: () => ({ n: 0 }),
      intent: {},
      update: {},
      view: () => html`<p>light</p>`,
    });
    expect(header()).toBe(first); // rebuilt: a light component adds no <style>, so no hash
    styled('csp-versioned-2', 'rgb(26, 27, 28)');
    const out = await renderToString(html`<csp-versioned-2></csp-versioned-2>`);
    expect(header()).toContain(sha(styleOf(out)));
  });
});

describe('a policy built before a component registered (development)', () => {
  it('warns once, naming the component whose <style> hash is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const csp = await contentSecurityPolicy();
    styled('csp-too-late', 'rgb(10, 11, 12)');
    const body = html`<csp-too-late></csp-too-late>`;
    renderPage({ title: 't', body, csp, dev: true });
    renderPage({ title: 't', body, csp, dev: true });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/lacks the <style> hash of <csp-too-late>/);
    renderPage({ title: 't', body, csp: "style-src 'self' 'unsafe-inline'", dev: true });
    styled('csp-quiet', 'rgb(13, 14, 15)');
    renderPage({ title: 't', body, csp, dev: false }); // production: no check
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
