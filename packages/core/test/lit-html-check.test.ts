// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html } from '../src/index.js';
import {
  leakingLitHtml,
  resetLitHtmlWarningForTests,
  warnLeakingLitHtmlOnce,
} from '../src/lit-html-check.js';

const g = globalThis as { litHtmlVersions?: string[] | undefined };

describe('lit-html leak check (gyral-9y6)', () => {
  const original = g.litHtmlVersions;

  afterEach(() => {
    g.litHtmlVersions = original;
    resetLitHtmlWarningForTests();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('flags 3.3.1 and later 3.x, not 3.3.0 or earlier', () => {
    expect(leakingLitHtml(['3.3.0', '3.2.1', '2.8.0'])).toEqual([]);
    expect(leakingLitHtml(['3.3.1', '3.3.3', '3.4.0', '3.3.0'])).toEqual([
      '3.3.1',
      '3.3.3',
      '3.4.0',
    ]);
    expect(leakingLitHtml(['not-a-version'])).toEqual([]);
  });

  it('warns once when a leaking lit-html is loaded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    g.litHtmlVersions = ['3.3.3'];
    warnLeakingLitHtmlOnce();
    warnLeakingLitHtmlOnce();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('lit-html 3.3.3');
  });

  it('stays quiet on the pinned 3.3.0', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    g.litHtmlVersions = ['3.3.0'];
    warnLeakingLitHtmlOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('runs when a component connects in a development build', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    g.litHtmlVersions = ['3.3.2'];
    define<{ readonly n: number }, never>('gy-leak-check', {
      init: () => ({ n: 0 }),
      intent: {},
      update: {},
      view: () => html`<p>hi</p>`,
    });
    document.body.append(document.createElement('gy-leak-check'));
    expect(warn.mock.calls.some(([m]) => String(m).includes('lit-html 3.3.2'))).toBe(true);
  });
});
