// view/01-templates.md "Normalization" step 3 (0.3.1, gyral-dyn.5): a static `style` attribute
// leaves the client HTML for the part table, as a multi-attribute with no holes the client
// applies through the CSSOM, because Firefox blocks it in a <template>'s HTML under a strict
// CSP. The server segments keep it as written, so server output is unchanged.
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/view/normalize/normalize.js';
import { emptyRender, readable, t } from './helpers.js';

describe('static style attributes (01 "Normalization")', () => {
  it('leave the client HTML for a part; the server writes them as before', () => {
    const n = normalize(t`<p class="a" style="color: red">${0}</p>`);
    expect(n.html).toBe('<p class="a"></p>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'attr', path: [0], name: 'style', strings: ['color: red'] },
      { k: 'child', path: [0], ref: null, sole: true },
    ]);
    expect(n.segments).toEqual([
      '<p class="a" style="color: red">',
      { k: 'child', in: 'p' },
      '</p>',
    ]);
  });

  it('take no value, keep bound parts in place and decode character references', () => {
    const n = normalize(t`<b STYLE='--x: &quot;a&quot;' title=${0}></b><i style></i>`);
    expect(n.html).toBe('<b></b><i></i>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'attr', path: [0], name: 'style', strings: ['--x: "a"'] },
      { k: 'attr', path: [0], name: 'title' },
      { k: 'attr', path: [1], name: 'style', strings: [''] },
    ]);
    expect(emptyRender(n.segments ?? [])).toBe(`<b STYLE='--x: &quot;a&quot;'></b><i style></i>`);
  });

  it('apply to SVG elements and custom elements, whose server props keep them', () => {
    const n = normalize(t`<svg style="fill: red"><path style="stroke: blue" /></svg>`);
    expect(n.html).toBe('<svg><path/></svg>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'attr', path: [0], name: 'style', strings: ['fill: red'] },
      { k: 'attr', path: [0, 0], name: 'style', strings: ['stroke: blue'] },
    ]);
    const c = normalize(t`<my-el style="--k: 1" a="b"></my-el>`);
    expect(c.html).toBe('<my-el a="b"></my-el>');
    expect(c.segments?.[0]).toEqual({
      k: 'open',
      tag: 'my-el',
      html: '<my-el style="--k: 1" a="b"',
      attrs: [
        ['style', '--k: 1'],
        ['a', 'b'],
      ],
    });
  });

  it('stay in a nested <template> and in page shells, which no part reaches', () => {
    const n = normalize(t`<template><p style="color: red"></p></template>`);
    expect(n.html).toBe('<template><p style="color: red"></p></template>');
    expect(n.parts).toEqual([]);
    const shell = normalize(t`<html><body style="margin: 0">${0}</body></html>`);
    expect(shell.server).toBe(true);
    expect(shell.html).toBe('<html><body style="margin: 0"></body></html>');
    expect(shell.parts.map(readable)).toEqual([
      { k: 'child', path: [0, 0], ref: null, sole: true },
    ]);
  });
});
