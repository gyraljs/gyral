// The embedded SSR protocol's contract test (ADR 0034, docs/design-docs/0034-ssr-protocol.md).
// gyral-rs runs an app's server bundle in deno_core: one IIFE, built by esbuild, evaluated with
// only protocol 1's host profile. This builds a fixture entry the same way, runs it in a
// `node:vm` context limited to that profile (support/embedded-host.ts), and checks what a host
// relies on: the declaration, the string result, escaping, the `onError: 'throw'` rejection,
// and markup the manifest-derived CSP allows. It also fingerprints the declarations the protocol
// relies on (support/protocol-api.ts) against the one docs/references/rust-compatibility.json
// records. A failure here means the server contract changed: undo the change, or bump
// SSR_PROTOCOL and specify the next protocol (or confirm it's compatible, as the message says).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { SSR_PROTOCOL, styleHashes } from '../src/index.js';
import { documentCss } from './fixtures/embedded/components.js';
import {
  ABSENT_GLOBALS,
  buildServerBundle,
  embeddedHost,
  HOST_GLOBALS,
  rejection,
} from './support/embedded-host.js';
import { protocolApi } from './support/protocol-api.js';

interface Fixture {
  readonly protocol: number;
  readonly apiHash: string;
  readonly limits: { readonly htmlBytes: number; readonly bundleBytes: number };
}
const fixture = JSON.parse(
  readFileSync(
    new URL('../../../docs/references/rust-compatibility.json', import.meta.url),
    'utf8',
  ),
) as Fixture;
const ENTRY = fileURLToPath(new URL('./fixtures/embedded/server.ts', import.meta.url));
const HOSTILE = '</h1><script>alert(1)</script>"\'&';
const hash = (text: string): string =>
  `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

let bundle = '';
beforeAll(async () => {
  bundle = await buildServerBundle(ENTRY);
});

/** Evaluates the bundle in a fresh host, then renders `request` there. */
function render(request: unknown) {
  const host = embeddedHost();
  host.evaluate(bundle);
  return { host, result: host.render(request) };
}

describe(`embedded SSR protocol ${String(SSR_PROTOCOL)} (ADR 0034)`, () => {
  it('is the protocol the compatibility fixture records', () => {
    expect(
      SSR_PROTOCOL,
      `SSR_PROTOCOL is ${String(SSR_PROTOCOL)}, but docs/references/rust-compatibility.json ` +
        `records protocol ${String(fixture.protocol)}. A new protocol needs its specification ` +
        `(an ADR 0034 addendum), a gyral-rs release that supports it, and the fixture pointing ` +
        `at both.`,
    ).toBe(fixture.protocol);
  });

  it('builds into one IIFE within the bundle limit', () => {
    expect(bundle.length).toBeGreaterThan(0);
    expect(new TextEncoder().encode(bundle).byteLength).toBeLessThanOrEqual(
      fixture.limits.bundleBytes,
    );
    expect(bundle).not.toMatch(/\bimport\s*\(/);
  });

  it('offers only the host profile: ECMAScript, Intl, queueMicrotask and console', () => {
    const host = embeddedHost();
    for (const name of ['Intl', ...HOST_GLOBALS]) {
      expect(host.evaluate(`typeof globalThis.${name}`), name).not.toBe('undefined');
    }
    for (const name of ABSENT_GLOBALS) {
      expect(host.evaluate(`typeof globalThis.${name}`), name).toBe('undefined');
    }
  });

  // The probe that shows the harness catches a dependency on a missing global: each one
  // fails the render the way it fails in gyral-rs.
  it.each(ABSENT_GLOBALS)('fails a render that needs %s', async (name) => {
    const host = embeddedHost();
    host.evaluate(`globalThis.gyralRender = async () => String(${name});`);
    expect(await rejection(host.render({ page: 'home', props: {} }))).toMatchObject({
      name: 'ReferenceError',
    });
  });

  it('declares the protocol when the bundle is evaluated', () => {
    const host = embeddedHost();
    expect(host.evaluate('typeof globalThis.gyralBundleVersion')).toBe('undefined');
    host.evaluate(bundle);
    expect(host.evaluate('globalThis.gyralBundleVersion')).toBe(SSR_PROTOCOL);
    expect(host.evaluate('typeof globalThis.gyralRender')).toBe('function');
  });

  it('renders a page with escaped props, stores, a form and a time zone', async () => {
    const props: unknown = JSON.parse(
      `{"name":${JSON.stringify(HOSTILE)},"__proto__":{"polluted":1}}`,
    );
    const { host, result } = render({ page: 'home', props });
    const html = await result;
    expect(typeof html).toBe('string');
    if (typeof html !== 'string') return;
    expect(html.length).toBeGreaterThan(0);
    expect(new TextEncoder().encode(html).byteLength).toBeLessThanOrEqual(fixture.limits.htmlBytes);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<h1>Hello, &lt;/h1&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)');
    expect(html.match(/Shared name: <strong>&lt;\/h1&gt;/g)).toHaveLength(2);
    expect(html.match(/Visits: <output>7<\/output>/g)).toHaveLength(2);
    expect(html).toContain('autocomplete="name" value="&lt;/h1&gt;&lt;script&gt;');
    expect(html).toContain('>1:30 AM EST</time>');
    expect(html).toContain('shadowrootmode="open"');
    expect(host.evaluate('Object.prototype.polluted')).toBeUndefined();
    expect(host.logs).toEqual([]);
  });

  it("rejects when a component fails under onError: 'throw', and on an unknown page", async () => {
    const broken = await rejection(render({ page: 'broken', props: {} }).result);
    expect(broken.message).toMatch(/G0078/);
    const unknown = await rejection(render({ page: 'nope', props: {} }).result);
    expect(unknown.message).toBe('Unknown page');
  });

  it('writes markup the manifest-derived CSP allows', async () => {
    const html = String(await render({ page: 'home', props: { name: 'Ada' } }).result);
    // No inline script runs: every script element loads its source (seeds are attributes).
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) expect(tag).toMatch(/\ssrc=/);
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle=/i);
    // Every <style> is the page's own CSS or a component's, listed by styleHashes().
    const allowed = new Set([...(await styleHashes()), hash(documentCss)]);
    const styles = [...html.matchAll(/<style>([^<]*)<\/style>/g)].map(([, text = '']) => text);
    expect(styles.length).toBeGreaterThan(1);
    for (const text of styles) expect(allowed).toContain(hash(text));
    for (const value of await styleHashes()) {
      expect(value).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
    }
  });

  it('keeps the declarations the protocol relies on', { timeout: 60_000 }, () => {
    const api = protocolApi();
    expect(
      api.sha256,
      `The server contract's declarations changed (ADR 0034 "What changes the protocol"):\n\n` +
        `${api.text}\n\nUndo the change, or decide whether an embedded host can notice it. ` +
        `If one can, bump SSR_PROTOCOL and specify the next protocol (ADR 0034 addendum). If ` +
        `not, confirm it's compatible: set "apiHash" in ` +
        `docs/references/rust-compatibility.json to ${api.sha256}.`,
    ).toBe(fixture.apiHash);
  });
});
