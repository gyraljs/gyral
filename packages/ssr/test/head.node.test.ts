// ADR 0019: page() writes the managed head (each element marked with its key, right after
// <title>), and keeps hand-written extraHead content separate.
import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { page, renderToString } from '../src/index.js';

const headOf = async (options: Parameters<typeof page>[0]) => {
  const out = await renderToString(page(options));
  return /<head>([\s\S]*)<\/head>/.exec(out)?.[1] ?? '';
};
const body = html`<p>hi</p>`;

describe('page() and the head model', () => {
  it('writes every managed field after <title>, in order, marked with its key', async () => {
    const head = await headOf({
      title: 'Shoes',
      description: 'All our shoes',
      robots: 'index, follow',
      canonical: 'https://shop.example/shoes',
      meta: [
        { property: 'og:title', content: 'Shoes' },
        { name: 'theme-color', content: '#123456' },
      ],
      links: [{ rel: 'alternate', hreflang: 'fr', href: 'https://shop.example/fr/shoes' }],
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage' }],
      lang: 'en-GB',
      body,
    });
    const managed = head.slice(head.indexOf('</title>') + '</title>'.length);
    expect(managed.replace(/<!--gyral:\w+-->/g, '')).toMatch(
      new RegExp(
        '^' +
          [
            '<meta name="description" content="All our shoes" data-gyral-head="name:description">',
            '<meta name="robots" content="index, follow" data-gyral-head="name:robots">',
            '<link rel="canonical" href="https://shop.example/shoes" data-gyral-head="canonical">',
            '<meta property="og:title" content="Shoes" data-gyral-head="property:og:title">',
            '<meta name="theme-color" content="#123456" data-gyral-head="name:theme-color">',
            '<link rel="alternate" hreflang="fr" href="https://shop.example/fr/shoes" ' +
              'data-gyral-head="link:hreflang=fr;rel=alternate">',
            '<script type="application/ld+json" data-gyral-head="ld:0">' +
              '{"@context":"https://schema.org","@type":"CollectionPage"}</script>',
          ]
            .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join(''),
      ),
    );
  });

  it('sets lang and dir on <html>', async () => {
    const out = await renderToString(page({ title: 't', lang: 'ar', dir: 'rtl', body }));
    expect(out).toContain('<html lang="ar" dir="rtl">');
  });

  it('escapes attribute values and keeps JSON-LD inside its element', async () => {
    const head = await headOf({
      title: 't',
      description: 'Tom & "Jerry" <b>',
      jsonLd: [{ name: '</script><script>alert(1)</script>' }],
      body,
    });
    expect(head).toContain('content="Tom &#38; &#34;Jerry&#34; &#60;b&#62;"');
    expect(head.match(/<\/script>/g)).toHaveLength(1);
    expect(head).toContain('\\u003c/script\\u003e');
  });

  it('writes extraHead after the managed head, unmarked', async () => {
    const head = await headOf({
      title: 't',
      canonical: 'https://example.com/',
      extraHead: html`<link rel="icon" href="/favicon.svg" />`,
      body,
    });
    expect(head).toContain('<link rel="icon" href="/favicon.svg">');
    expect(head.indexOf('rel="icon"')).toBeGreaterThan(head.indexOf('data-gyral-head="canonical"'));
  });

  it('writes no managed elements for a title-only page', async () => {
    expect(await headOf({ title: 't', body })).not.toContain('data-gyral-head');
  });
});
