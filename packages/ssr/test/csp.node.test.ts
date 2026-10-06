// view/06-server.md "CSP": the page helper's Content-Security-Policy allows every shadow
// component's declarative-shadow-root <style> and the page's global styles by hash.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { css, define, html } from '@gyral/core';
import { contentSecurityPolicy, renderPage, renderToString } from '../src/index.js';

define<{ readonly n: number }, never>('csp-styled', {
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
