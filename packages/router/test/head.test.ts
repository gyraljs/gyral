// ADR 0019, the client half of the head model: setHead() makes the document's managed head
// match a Head, keyed and minimal, and never touches unmanaged head content.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Head } from '@gyral/core';
import { makeRouter, setHead } from '../src/index.js';
import { applyHead } from '../src/internal/head.js';

const original = { title: document.title, lang: document.documentElement.lang };
const managed = () =>
  [...document.head.querySelectorAll('[data-gyral-head]')].map((el) => el.outerHTML);

/** Every mutation `fn` causes in <head> (and on <html>'s lang/dir). */
async function mutations(fn: () => void): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((list) => records.push(...list));
  observer.observe(document.head, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  observer.observe(document.documentElement, { attributes: true });
  fn();
  await Promise.resolve();
  records.push(...observer.takeRecords());
  observer.disconnect();
  return records;
}

const product: Head = {
  title: 'Blue mug — Shop',
  description: 'A blue mug.',
  canonical: 'https://shop.example/products/blue-mug',
  meta: [{ property: 'og:type', content: 'product' }],
  links: [{ rel: 'alternate', hreflang: 'fr', href: 'https://shop.example/fr/products/blue-mug' }],
  jsonLd: [{ '@type': 'Product', name: 'Blue mug' }],
};

beforeEach(() => {
  if (document.head.querySelector('title') === null) {
    document.head.prepend(document.createElement('title'));
  }
});

afterEach(() => {
  for (const el of document.head.querySelectorAll('[data-gyral-head], [data-test-unmanaged]')) {
    el.remove();
  }
  document.title = original.title;
  document.documentElement.lang = original.lang;
  document.documentElement.removeAttribute('dir');
});

describe('setHead() in the browser', () => {
  it('adopts a matching server head without writing anything', async () => {
    applyHead(document, product);
    const server = managed();
    expect(server).toHaveLength(5);
    const records = await mutations(() => {
      applyHead(document, product);
    });
    expect(records).toEqual([]);
    expect(managed()).toEqual(server);
  });

  it('inserts, updates in place and removes managed elements', () => {
    applyHead(document, { ...product, robots: 'noindex' });
    const canonical = document.head.querySelector('link[rel=canonical]');
    applyHead(document, {
      title: 'Red mug — Shop',
      canonical: 'https://shop.example/products/red-mug',
      meta: [{ name: 'theme-color', content: 'red' }],
      jsonLd: [{ '@type': 'Product', name: 'Red mug' }],
    });
    expect(document.title).toBe('Red mug — Shop');
    expect(document.head.querySelector('link[rel=canonical]')).toBe(canonical); // same node
    expect(canonical?.getAttribute('href')).toBe('https://shop.example/products/red-mug');
    expect(document.head.querySelector('meta[name=robots]')).toBeNull();
    expect(document.head.querySelector('meta[name=description]')).toBeNull();
    expect(document.head.querySelector('meta[property="og:type"]')).toBeNull();
    expect(document.head.querySelector('link[rel=alternate]')).toBeNull();
    expect(managed()).toEqual([
      '<link data-gyral-head="canonical" rel="canonical" href="https://shop.example/products/red-mug">',
      '<meta data-gyral-head="name:theme-color" name="theme-color" content="red">',
      '<script data-gyral-head="ld:0" type="application/ld+json">{"@type":"Product","name":"Red mug"}</script>',
    ]);
  });

  it('keeps managed elements right after <title>, in entry order', () => {
    applyHead(document, { title: 't', canonical: 'https://example.com/', robots: 'noindex' });
    const title = document.head.querySelector('title');
    expect(title?.nextElementSibling?.getAttribute('data-gyral-head')).toBe('name:robots');
    expect(title?.nextElementSibling?.nextElementSibling?.getAttribute('data-gyral-head')).toBe(
      'canonical',
    );
  });

  it('never touches unmanaged head content', () => {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = '/favicon.svg';
    icon.setAttribute('data-test-unmanaged', '');
    document.head.append(icon);
    applyHead(document, product);
    applyHead(document, { title: 'Empty' });
    expect(icon.isConnected).toBe(true);
    expect(icon.getAttribute('href')).toBe('/favicon.svg');
    expect(managed()).toEqual([]);
  });

  it('writes only the title for a title-only head on a page without managed elements', async () => {
    const records = await mutations(() => {
      applyHead(document, { title: 'Only the title' });
    });
    expect(document.title).toBe('Only the title');
    expect(records.every((r) => r.target === document.head.querySelector('title'))).toBe(true);
    expect(managed()).toEqual([]);
  });

  it('sets lang and dir on <html> when given', () => {
    applyHead(document, { title: 't', lang: 'he', dir: 'rtl' });
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('runs as a router command, and the snapshot records the head', async () => {
    const driver = makeRouter({ navigationApi: false });
    const head: Head = { title: 'Via the router', robots: 'noindex' };
    const cmd = setHead(head);
    await driver.run(cmd.input as never, { signal: new AbortController().signal, emit: vi.fn() });
    expect(document.title).toBe('Via the router');
    expect(document.head.querySelector('meta[name=robots]')?.getAttribute('content')).toBe(
      'noindex',
    );
    expect(driver.snapshot().head).toBe(head);
    driver.dispose();
  });
});

// "CSP" in ADR 0019: a data block (`type="application/ld+json"`) is not script, so `script-src`
// never applies to it, whether the server wrote it or the client set its text.
const HEAD_MODULE = new URL('../src/internal/head.ts', import.meta.url).href;
type Win = Window &
  typeof globalThis & {
    applyHead?: typeof applyHead;
    violations?: string[];
  };

async function frame(csp: string, headMarkup: string): Promise<Win> {
  const iframe = document.createElement('iframe');
  iframe.srcdoc =
    `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<title>t</title>${headMarkup}` +
    `<script nonce="n">window.violations = []; document.addEventListener(` +
    `'securitypolicyviolation', (e) => { window.violations.push(e.violatedDirective); });</script>` +
    `<script type="module" nonce="n">import { applyHead } from ${JSON.stringify(HEAD_MODULE)};` +
    ` window.applyHead = applyHead;</script></head><body></body></html>`;
  document.body.append(iframe);
  const win = iframe.contentWindow as Win;
  await expect.poll(() => win.applyHead, { timeout: 10_000 }).toBeDefined();
  return win;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('JSON-LD under a strict CSP', () => {
  afterEach(() => {
    for (const iframe of document.querySelectorAll('iframe')) iframe.remove();
  });

  it('is not subject to script-src: no violation from server or client JSON-LD', async () => {
    const win = await frame(
      "script-src 'self' 'nonce-n'",
      '<script type="application/ld+json" data-gyral-head="ld:0">{"@type":"Thing"}</script>',
    );
    const doc = win.document;
    // Control: an inline classic script without the nonce is refused, so the policy is enforced.
    const control = doc.createElement('script');
    control.textContent = 'window.ran = true;';
    doc.head.append(control);
    await settle();
    expect(win.violations).toContain('script-src-elem');
    const before = win.violations?.length ?? 0;
    win.applyHead?.(doc, {
      title: 't',
      jsonLd: [{ '@type': 'Thing', name: 'updated' }, { '@type': 'Organization' }],
    });
    await settle();
    expect(win.violations).toHaveLength(before);
    expect(doc.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(2);
    expect(JSON.parse(doc.querySelector('[data-gyral-head="ld:0"]')?.textContent ?? '')).toEqual({
      '@type': 'Thing',
      name: 'updated',
    });
  });

  it('skips client JSON-LD updates where Trusted Types are enforced', async () => {
    const win = await frame(
      "script-src 'self' 'nonce-n'; require-trusted-types-for 'script'",
      '<script type="application/ld+json" data-gyral-head="ld:0">{"@type":"Thing"}</script>',
    );
    // Trusted Types are a Chromium feature in this suite's engines; elsewhere the update applies.
    const enforced = 'trustedTypes' in win;
    const warn = vi.spyOn(win.console, 'warn').mockImplementation(() => undefined);
    win.applyHead?.(win.document, {
      title: 'still applied',
      canonical: 'https://example.com/',
      jsonLd: [{ '@type': 'Thing', name: 'new' }, { '@type': 'Organization' }],
    });
    expect(win.document.title).toBe('still applied');
    expect(win.document.querySelector('link[rel=canonical]')).not.toBeNull();
    const ld = win.document.querySelectorAll('script[type="application/ld+json"]');
    if (enforced) {
      expect(ld).toHaveLength(1); // the server's block stays, nothing empty is inserted
      expect(ld[0]?.textContent).toBe('{"@type":"Thing"}');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Trusted Types'));
    } else {
      expect(ld).toHaveLength(2);
    }
  });
});
