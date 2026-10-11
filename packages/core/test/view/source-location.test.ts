// view/01-templates.md "Source locations" (gyral-g1r.24), development: runtime templates know
// where they were written, so a template rule error and a hydration mismatch name the file,
// line and column of the html`…` call. Under Vite (this test runs in Vitest, i.e. `vite
// serve`), the preset's `gyral:template-locations` transform gives exact positions; elsewhere
// the runtime reads them from a stack trace.
import { describe, expect, it } from 'vitest';
import { html, hydrate, HydrationMismatch, svg, TemplateError } from '../../src/view/index.js';
import { templateOf } from '../../src/view/template.js';
import source from './source-location.test.ts?raw';
import { mount } from './render-helpers.js';

const FILE = 'packages/core/test/view/source-location.test.ts';

/** `file:line:col` of the html`…` (or svg`…`) call on the line holding `marker` (in a comment). */
function locOf(marker: string, tag = 'html'): string {
  const lines = source.split('\n');
  const line = lines.findIndex((l) => l.includes(marker) && l.includes(`${tag}\``));
  return `${FILE}:${String(line + 1)}:${String((lines[line] ?? '').indexOf(`${tag}\``) + 1)}`;
}

/** The error `fn` throws. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('source locations in development (view/01 "Source locations")', () => {
  it('names the call site in a template rule error', () => {
    // eslint-disable-next-line gyral/template -- the rule error under test
    const bad = () => html`<my-el />`; // @loc:rule
    const error = (() => {
      try {
        templateOf(bad());
      } catch (e) {
        return e;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(TemplateError);
    expect((error as TemplateError).loc).toBe(locOf('@loc:rule'));
    expect((error as TemplateError).message).toContain(`\n  at ${locOf('@loc:rule')}`);
  });

  it('names the call site in a hydration mismatch', () => {
    const el = mount();
    el.innerHTML = '<p>server</p>';
    const view = html`<span>${'client'}</span>`; // @loc:mismatch
    expect(() => {
      hydrate(view, el, '<x-test>');
    }).toThrow(HydrationMismatch);
    try {
      hydrate(view, el, '<x-test>');
    } catch (e) {
      expect(String(e)).toContain(`in <x-test> (template at ${locOf('@loc:mismatch')}) at`);
    }
  });

  it("names an svg template's call site too (prepared on its first call)", () => {
    // eslint-disable-next-line gyral/template -- the rule error under test
    const error = thrown(() => svg`<div></div>`); // @loc:svg
    expect(error).toBeInstanceOf(TemplateError);
    expect((error as TemplateError).loc).toBe(locOf('@loc:svg', 'svg'));
    expect((error as TemplateError).message).toContain(`\n  at ${locOf('@loc:svg', 'svg')}`);
  });

  it('falls back to the stack trace where the transform cannot see the call', () => {
    const tag = html; // an alias: the transform leaves this call site alone
    const template = templateOf(tag`<p class="alias">${1}</p>`);
    expect(template.loc).toMatch(/source-location\.test\.ts:\d+:\d+$/);
    const s = svg; // the same for svg (HTML at its top level: rule 10, ESLint can't see it)
    const error = thrown(() => s`<p class="alias"></p>`);
    expect((error as TemplateError).loc).toMatch(/source-location\.test\.ts:\d+:\d+$/);
  });
});
