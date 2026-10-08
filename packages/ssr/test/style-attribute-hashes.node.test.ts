// ADR 0020: `renderPage({ csp: { styleAttributes: 'hash' } })` renders the page first and
// allows its `style` attribute values by hash in `style-src-attr` with 'unsafe-hashes'.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html } from '@gyral/core';
import { renderPage } from '../src/index.js';

const sha = (text: string) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

const header = (res: Response) => res.headers.get('content-security-policy') ?? '';
const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1);

define<{ readonly n: number }, never>('sah-box', {
  init: () => ({ n: 0 }),
  intent: {},
  update: {},
  view: () => html`<p style="color: red">box</p>`,
});

const bars = (values: readonly number[]) =>
  html`<ul>
    ${values.map((v) => html`<li style=${`--pct: ${String(v)}%`}>${v}</li>`)}
  </ul>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderPage({ csp: { styleAttributes: 'hash' } }) (ADR 0020)", () => {
  it("lists each distinct value's hash in style-src-attr with 'unsafe-hashes'", async () => {
    const body = html`<p style="color: red">a</p>
      <p style=${'--w: "x&y"'}>b</p>
      <p style="color: red"></p>`;
    const res = renderPage({
      title: 't',
      body: html`${body}<sah-box></sah-box>`,
      csp: { directives: { 'default-src': "'self'" }, styleAttributes: 'hash' },
    });
    const policy = header(res);
    expect(directive(policy, 'default-src')).toEqual(["'self'"]);
    expect(directive(policy, 'style-src')).toEqual(["'self'"]);
    expect(directive(policy, 'style-src-attr')).toEqual([
      "'unsafe-hashes'",
      sha('color: red'),
      sha('--w: "x&y"'),
    ]);
    // The whole page is in the body, and it is the same markup.
    const text = await res.text();
    expect(text).toContain('<p style="--w: &quot;x&amp;y&quot;">b</p>');
  });

  it("keeps a given style-src-attr and appends; adds nothing when it allows 'unsafe-inline'", () => {
    const body = html`<p style="color: red"></p>`;
    const kept = header(
      renderPage({
        title: 't',
        body,
        csp: { directives: { 'style-src-attr': "'self'" }, styleAttributes: 'hash' },
      }),
    );
    expect(directive(kept, 'style-src-attr')).toEqual([
      "'self'",
      "'unsafe-hashes'",
      sha('color: red'),
    ]);
    const inline = header(
      renderPage({
        title: 't',
        body,
        csp: { directives: { 'style-src-attr': "'unsafe-inline'" }, styleAttributes: 'hash' },
      }),
    );
    expect(directive(inline, 'style-src-attr')).toEqual(["'unsafe-inline'"]);
  });

  it('adds no style-src-attr to a page without style attributes', () => {
    const policy = header(
      renderPage({ title: 't', body: html`<p>plain</p>`, csp: { styleAttributes: 'hash' } }),
    );
    expect(directive(policy, 'style-src-attr')).toBeUndefined();
  });

  it('warns in development above 32 distinct values, and lists at most maxStyleHashes', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const values = Array.from({ length: 40 }, (_, i) => i);
    const policy = header(
      renderPage({
        title: 't',
        body: bars(values),
        csp: { styleAttributes: 'hash', maxStyleHashes: 35 },
        dev: true,
      }),
    );
    const listed = directive(policy, 'style-src-attr') ?? [];
    expect(listed).toHaveLength(36); // 'unsafe-hashes' + 35
    expect(listed).toContain(sha('--pct: 0%'));
    expect(listed).not.toContain(sha('--pct: 39%'));
    const messages = warn.mock.calls.map(([m]) => String(m));
    expect(messages.some((m) => /writes 40 distinct style attribute values/.test(m))).toBe(true);
    expect(messages.some((m) => /lists the first 35 \(maxStyleHashes\)/.test(m))).toBe(true);
  });

  it('keeps chunked output without the option', async () => {
    // A component is a chunk boundary: the first chunk ends before its content.
    const res = renderPage({ title: 't', body: html`<sah-box></sah-box>`, csp: {} });
    expect(directive(header(res), 'style-src-attr')).toBeUndefined();
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).not.toContain('</html>');
    await reader.cancel();
  });
});
