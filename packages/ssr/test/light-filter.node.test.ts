import { describe, expect, it } from 'vitest';
import { LightFilter } from '../src/internal/light.js';

const DSD = '<template shadowroot="open" shadowrootmode="open">';
const run = (chunks: readonly string[]): string => {
  const filter = new LightFilter();
  return chunks.map((c) => filter.push(c)).join('') + filter.flush();
};

// A light component containing a nested shadow component.
const input =
  `<x-page>${DSD}<!--gyral:light--><!--lit-part a--><h1>Hi</h1>` +
  `<!--lit-node 1--><x-item defer-hydration>${DSD}<!--lit-part b--><p>in</p><!--/lit-part-->` +
  `</template></x-item><!--/lit-part--><!--/gyral:light--></template></x-page>` +
  `<x-shadow>${DSD}<!--lit-part c--><b>s</b><!--/lit-part--></template></x-shadow>`;

const expected =
  `<x-page><h1>Hi</h1>` +
  `<x-item defer-hydration>${DSD}<!--lit-part b--><p>in</p><!--/lit-part-->` +
  `</template></x-item></x-page>` +
  `<x-shadow>${DSD}<!--lit-part c--><b>s</b><!--/lit-part--></template></x-shadow>`;

describe('LightFilter (ADR 0014)', () => {
  it('unwraps light views, strips their hydration comments, keeps nested shadow DSD', () => {
    expect(run([input])).toBe(expected);
  });

  it('gives the same result however the stream is chunked', () => {
    for (let size = 1; size <= 40; size += 1) {
      const chunks: string[] = [];
      for (let i = 0; i < input.length; i += size) chunks.push(input.slice(i, i + size));
      expect(run(chunks)).toBe(expected);
    }
  });

  it('passes ordinary templates and markup through untouched', () => {
    const plain = `<template><p>t</p></template><x-a>${DSD}<!--lit-part z-->x<!--/lit-part--></template></x-a>`;
    expect(run([plain])).toBe(plain);
  });
});
