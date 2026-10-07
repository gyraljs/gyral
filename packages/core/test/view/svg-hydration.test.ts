// view/07-hydration.md for svg fragments (view/01 "svg templates"), in both builds: server
// output with svg`…` instances inside an <svg> hydrates in place (camelCase SVG elements such
// as clipPath and linearGradient included), development markers before svg instances are
// checked and removed, later renders update the adopted nodes, and a server DOM that differs is
// a mismatch (structure in every build, attributes in development).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from '../../src/server.js';
import {
  DEV,
  each,
  html,
  hydrate,
  HydrationMismatch,
  nothing,
  render,
  svg,
  type ChildValue,
} from '../../src/view/index.js';
import { canon, cleanup, container, nodesOf, serverDom } from './hydrate-helpers.js';
import { watch } from './render-helpers.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SVG_NS = 'http://www.w3.org/2000/svg';

const face = (suit: string | undefined, name: string, pips: readonly number[]) =>
  html`<figure>
    <svg viewBox="0 0 10 14">
      ${svg`<defs><clipPath id="r"><rect width="10" height="14" /></clipPath><linearGradient
        id="g"
        gradientTransform="rotate(${90})"
      ><stop offset="0" /></linearGradient></defs>`}
      <g clip-path="url(#r)">
        ${suit === undefined ? nothing : svg`<path class=${suit} d="M0 0h1" />`}
        <text x="1" y="2">${name}</text>
        ${each(
          pips,
          (p) => p,
          (p) => svg`<circle cx=${p} r="1" />`,
        )}
      </g>
    </svg>
    <figcaption>${name}</figcaption>
  </figure>`;

describe('hydrating svg fragments (view/07, view/01 "svg templates")', () => {
  it('adopts the server DOM in place and writes nothing', () => {
    const value = face('circle', 'Han', [1, 2, 3]);
    const root = serverDom(value);
    const before = nodesOf(root);
    const strict = canon(root, true);
    const changes = watch(root);
    hydrate(value, root);
    expect(changes.take().filter((m) => m.type === 'attributes')).toEqual([]);
    expect(canon(root, true)).toBe(strict);
    expect(nodesOf(root).filter((n) => before.includes(n))).toEqual(before);
    const clip = root.querySelector('defs > *');
    expect(clip?.localName).toBe('clipPath');
    expect(clip?.namespaceURI).toBe(SVG_NS);
    const fresh = container();
    render(value, fresh);
    expect(canon(root)).toBe(canon(fresh));
  });

  it('updates the adopted svg parts on the next render', () => {
    const root = serverDom(face('circle', 'Han', [1, 2, 3]));
    hydrate(face('circle', 'Han', [1, 2, 3]), root);
    const path = root.querySelector('path');
    const circles = [...root.querySelectorAll('circle')];
    render(face('square', 'Lando', [3, 1]), root);
    expect(root.querySelector('path')).toBe(path);
    expect(path?.getAttribute('class')).toBe('square');
    expect(root.querySelector('text')?.textContent).toBe('Lando');
    expect([...root.querySelectorAll('circle')]).toEqual([circles[2], circles[0]]);
    render(face(undefined, 'Lando', []), root);
    expect(root.querySelector('path')).toBeNull();
    expect(root.querySelectorAll('circle')).toHaveLength(0);
    const fresh = container();
    render(face(undefined, 'Lando', []), fresh);
    expect(canon(root)).toBe(canon(fresh));
  });

  it('checks and removes development markers before svg instances', () => {
    const value = html`<svg>${svg`<g>${'a'}</g>`}</svg>`;
    const markup = renderToString(value, { dev: true });
    expect(markup).toMatch(/<svg><!--gyral:[0-9a-z]+--><g>a<\/g><\/svg>/);
    const root = container();
    root.setHTMLUnsafe(markup);
    hydrate(value, root);
    expect(root.innerHTML).not.toContain('gyral:');
    const wrong = container();
    wrong.setHTMLUnsafe(markup.replace(/<svg><!--gyral:[0-9a-z]+-->/, '<svg><!--gyral:zzz-->'));
    const run = () => {
      hydrate(value, wrong, '<test-host>');
    };
    if (DEV) expect(run).toThrow(HydrationMismatch);
    else expect(run).not.toThrow();
  });

  it('a different SVG element is a mismatch in every build; an attribute in development', () => {
    const value = html`<svg>${svg`<circle r=${1} />`}</svg>`;
    const ok = renderToString(value, { dev: false });
    const swapped = container();
    swapped.setHTMLUnsafe(ok.replace('<circle', '<rect'));
    expect(() => {
      hydrate(value, swapped, '<test-host>');
    }).toThrow(/expected <circle>, found <rect>/);
    const attr = container();
    attr.setHTMLUnsafe(ok.replace('r="1"', 'r="2"'));
    const run = () => {
      hydrate(value, attr, '<test-host>');
    };
    if (DEV) expect(run).toThrow(HydrationMismatch);
    else expect(run).not.toThrow();
    // Development names the svg template's call site: column 31, `svg` (01 "Source locations").
    if (DEV) expect(run).toThrow(/\(template at [^)]*svg-hydration\.test\.ts:\d+:31\) at svg/);
  });

  it('an svg template outside SVG content is a development error', () => {
    const value: ChildValue = html`<p>${svg`<g></g>`}</p>`;
    const root = container();
    root.setHTMLUnsafe('<p><g></g></p>');
    const run = () => {
      hydrate(value, root, '<test-host>');
    };
    if (DEV) expect(run).toThrow(/expected an svg template inside SVG content .*, found <p>/);
    else expect(run).not.toThrow();
  });
});
