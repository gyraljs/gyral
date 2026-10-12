import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { html } from '@gyral/core';
import { renderPage } from '../src/index.js';

describe('static and managed head policy', () => {
  it('measures marker cost and offers the existing unmarked extraHead path', async () => {
    const common = { title: 'Catalog', body: html`<p>Catalog</p>`, dev: false };
    const managed = await renderPage({
      ...common,
      description: 'Items',
      robots: 'index, follow',
      canonical: 'https://example.test/',
      meta: [
        { property: 'og:title', content: 'Catalog' },
        { name: 'theme-color', content: '#123456' },
      ],
    }).text();
    const staticHead = await renderPage({
      ...common,
      extraHead: html`<meta name="description" content="Items" /><meta
          name="robots"
          content="index, follow"
        /><link rel="canonical" href="https://example.test/" /><meta
          property="og:title"
          content="Catalog"
        /><meta name="theme-color" content="#123456" />`,
    }).text();
    const markers = managed.match(/ data-gyral-head="[^"]*"/g) ?? [];
    expect(markers).toHaveLength(5);
    expect(staticHead).not.toContain('data-gyral-head');
    expect(managed.replace(/ data-gyral-head="[^"]*"/g, '')).toBe(staticHead);
    const measurements = {
      markers: markers.length,
      markerBytes: Buffer.byteLength(markers.join('')),
      gzipDelta: gzipSync(managed).length - gzipSync(staticHead).length,
    };
    expect(measurements).toEqual({ markers: 5, markerBytes: 164, gzipDelta: 37 });
  });
});
