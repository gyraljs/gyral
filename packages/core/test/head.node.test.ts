// ADR 0019 "Keys, dedupe and order": the pure normalizer both halves of the head model share.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { headEntries, type Head, type HeadLink, type HeadMeta } from '../src/index.js';

const keys = (head: Head) => headEntries(head).map((e) => e.key);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('headEntries', () => {
  it('orders description, robots, canonical, meta, links, then JSON-LD', () => {
    expect(
      keys({
        title: 't',
        jsonLd: [{ '@type': 'Thing' }],
        links: [{ rel: 'icon', href: '/i.svg' }],
        meta: [{ property: 'og:title', content: 'T' }],
        canonical: 'https://example.com/a',
        robots: 'noindex',
        description: 'd',
      }),
    ).toEqual([
      'name:description',
      'name:robots',
      'canonical',
      'property:og:title',
      'link:rel=icon',
      'ld:0',
    ]);
  });

  it('writes nothing for a head with only a title, lang and dir', () => {
    expect(headEntries({ title: 't', lang: 'fr', dir: 'rtl' })).toEqual([]);
  });

  it('lets later meta and links win, at the later position', () => {
    const meta: HeadMeta[] = [
      { name: 'theme-color', content: 'red' },
      { property: 'og:type', content: 'website' },
      { name: 'theme-color', content: 'blue' },
    ];
    const links: HeadLink[] = [
      { rel: 'alternate', hreflang: 'fr', href: '/fr/a' },
      { rel: 'alternate', hreflang: 'de', href: '/de/a' },
      { rel: 'alternate', hreflang: 'fr', href: '/fr/b' },
    ];
    const entries = headEntries({ title: 't', meta, links });
    expect(entries.map((e) => e.key)).toEqual([
      'property:og:type',
      'name:theme-color',
      'link:hreflang=de;rel=alternate',
      'link:hreflang=fr;rel=alternate',
    ]);
    expect(entries[1]?.attributes).toEqual([
      ['name', 'theme-color'],
      ['content', 'blue'],
    ]);
    expect(entries[3]?.attributes).toEqual([
      ['rel', 'alternate'],
      ['hreflang', 'fr'],
      ['href', '/fr/b'],
    ]);
  });

  it('gives the typed description and robots precedence over meta entries', () => {
    const entries = headEntries({
      title: 't',
      description: 'typed',
      meta: [
        { name: 'description', content: 'from meta' },
        { name: 'robots', content: 'index' },
      ],
    });
    // robots has no typed value here, so the meta entry stays.
    expect(entries.map((e) => [e.key, e.attributes[1]?.[1]])).toEqual([
      ['name:description', 'typed'],
      ['name:robots', 'index'],
    ]);
  });

  it('serializes JSON-LD so it cannot end its script element', () => {
    const [entry] = headEntries({
      title: 't',
      jsonLd: [{ name: '</script><!-- & \u2028' }],
    });
    expect(entry?.tag).toBe('script');
    expect(entry?.attributes).toEqual([['type', 'application/ld+json']]);
    expect(entry?.text).not.toMatch(/[<>&\u2028]/);
    expect(JSON.parse(entry?.text ?? '')).toEqual({ name: '</script><!-- & \u2028' });
  });

  it('refuses entries that belong to page() itself (development)', () => {
    const refused: Head[] = [
      { title: 't', meta: [{ name: 'viewport', content: 'width=device-width' }] },
      { title: 't', meta: [{ 'http-equiv': 'refresh', content: '0' } as unknown as HeadMeta] },
      { title: 't', links: [{ rel: 'stylesheet', href: '/a.css' }] },
      { title: 't', links: [{ rel: 'modulepreload', href: '/a.js' }] },
      { title: 't', links: [{ rel: 'preload', href: '/a.woff2', as: 'font' }] },
      { title: 't', links: [{ rel: 'canonical', href: 'https://example.com/' }] },
    ];
    for (const head of refused) {
      expect(() => headEntries(head)).toThrow(/not a managed head entry/);
    }
  });

  it('warns about a canonical URL that is not absolute (development)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    headEntries({ title: 't', canonical: '/about' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not an absolute URL'));
    warn.mockClear();
    headEntries({ title: 't', canonical: 'https://example.com/about' });
    expect(warn).not.toHaveBeenCalled();
  });
});
