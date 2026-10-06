// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
import { describe, expect, it } from 'vitest';
import { revealLightMarkers } from '../src/light-dom.js';

// Server output shape (ADR 0014 addendum): markers inside light views are hidden behind a
// `gyral:` prefix; every light host carries data-gyral-light.
const build = (): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML =
    '<x-outer data-gyral-light><!--gyral:lit-part A--><h1>Hi</h1>' +
    '<!--gyral:lit-node 1--><x-mid data-gyral-light defer-hydration>' +
    '<!--gyral:lit-part B--><p>mid</p>' +
    '<!--gyral:lit-node 1--><x-inner data-gyral-light defer-hydration>' +
    '<!--gyral:lit-part C--><b>in</b><!--gyral:/lit-part--></x-inner>' +
    '<!--gyral:/lit-part--></x-mid>' +
    '<!-- an ordinary comment --><!--gyral:/lit-part--></x-outer>';
  return root;
};

const comments = (el: Element): string[] => {
  const out: string[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_COMMENT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) out.push((n as Comment).data);
  return out;
};

const get = (root: Element, sel: string): HTMLElement => {
  const el = root.querySelector(sel);
  if (!(el instanceof HTMLElement)) throw new Error(`missing ${sel}`);
  return el;
};

describe('revealLightMarkers', () => {
  it("reveals only the host's own markers, level by level", () => {
    const root = build();
    const outer = get(root, 'x-outer');
    const mid = get(root, 'x-mid');
    const inner = get(root, 'x-inner');

    expect(revealLightMarkers(outer)).toBe(true);
    expect(comments(outer)).toEqual([
      'lit-part A',
      'lit-node 1', // mid's node marker belongs to the outer view
      'gyral:lit-part B',
      'gyral:lit-node 1',
      'gyral:lit-part C',
      'gyral:/lit-part',
      'gyral:/lit-part',
      ' an ordinary comment ',
      '/lit-part',
    ]);

    expect(revealLightMarkers(mid)).toBe(true);
    expect(comments(inner)).toEqual(['gyral:lit-part C', 'gyral:/lit-part']);

    expect(revealLightMarkers(inner)).toBe(true);
    expect(comments(inner)).toEqual(['lit-part C', '/lit-part']);
  });

  it('reports false when the host has no hidden root marker (client-rendered)', () => {
    const el = document.createElement('x-plain');
    el.innerHTML = '<p>client</p>';
    expect(revealLightMarkers(el)).toBe(false);
  });
});
