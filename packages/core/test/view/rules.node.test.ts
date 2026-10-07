// view/09-template-rules.md "Errors": every rule the normalizer checks from one template's
// strings throws a TemplateError with its rule number, a message saying what is wrong and what
// to write instead (core belief 7), and the call site's loc.
import { describe, expect, it } from 'vitest';
import { TemplateError } from '../../src/view/normalize/errors.js';
import { normalize } from '../../src/view/normalize/normalize.js';
import { t } from './helpers.js';

function errorOf(strings: readonly string[], loc?: string): TemplateError {
  try {
    normalize(strings, loc);
  } catch (error) {
    if (error instanceof TemplateError) return error;
    throw error;
  }
  throw new Error(`expected a TemplateError for ${JSON.stringify(strings)}`);
}

/** Asserts the rule and that the message contains every fragment. */
function expectRule(strings: readonly string[], rule: number, ...fragments: string[]): void {
  const error = errorOf(strings);
  expect(error.rule, error.message).toBe(rule);
  expect(error.message).toContain(`rule ${String(rule)}`);
  for (const fragment of fragments) expect(error.message).toContain(fragment);
}

describe('template errors (view/09)', () => {
  it('names the rule, the spec and the call site', () => {
    const error = errorOf(t`<b @click=${0}></b>`, 'src/app.ts:3:5');
    expect(error).toBeInstanceOf(TemplateError);
    expect(error.name).toBe('TemplateError');
    expect(error.loc).toBe('src/app.ts:3:5');
    expect(error.message).toContain('docs/design-docs/view/09-template-rules.md');
    expect(error.message).toContain('at src/app.ts:3:5');
    expect(error.message).toContain('rule 1)\n  near: <b @click=${…}></b>\n  at src/app.ts:3:5');
  });

  it('rule 1: event bindings', () => {
    expectRule(t`<button @click=${0}></button>`, 1, '@click', 'data-intent=${i.Name}');
    expectRule(t`<button @click="${0}"></button>`, 1, 'event binding');
    expectRule(t`<button @click="a${0}"></button>`, 1, 'event binding');
  });

  it('rule 2: dynamic tag and attribute names', () => {
    expectRule(t`<${'p'}></p>`, 2, 'tag name', 'whole templates');
    expectRule(t`<p></${'p'}>`, 2, 'tag name');
    expectRule(t`<p${'x'}></p>`, 2, 'tag name');
    expectRule(t`<p ${'x'}="y"></p>`, 2, 'attribute name');
    expectRule(t`<p data-${'x'}="y"></p>`, 2, 'attribute name');
    expectRule(t`<p ${'x'}y></p>`, 2, 'attribute name');
  });

  it('rule 3: holes in <script>, <style>, comments, doctype and <template>', () => {
    expectRule(t`<script>let a = ${0}</script>`, 3, 'inside <script>', 'raw()');
    expectRule(t`<style>p { color: ${0} }</style>`, 3, 'inside <style>', 'CSS custom property');
    expectRule(t`<!-- ${0} -->`, 3, 'comment');
    expectRule(t`<!doctype ${0}>`, 3, 'doctype');
    expectRule(t`<template><p>${0}</p></template>`, 3, '<template>', 'nested html');
    expectRule(t`<template><p class=${0}></p></template>`, 3, '<template>');
  });

  it('rule 4: property bindings for form state', () => {
    expectRule(t`<input .value=${0}>`, 4, '.value', 'value=${…}');
    expectRule(t`<input type="checkbox" .checked=${0}>`, 4, '?checked=${…}');
    expectRule(t`<input type="checkbox" .indeterminate=${0}>`, 4, '?indeterminate=${…}');
    expectRule(t`<option .selected=${0}></option>`, 4, '?selected=${…}');
    expectRule(t`<details .open=${0}></details>`, 4, '?open=${…}');
    expectRule(t`<dialog .open=${0}></dialog>`, 4, '?open=${…}');
    expectRule(t`<textarea .value=${0}></textarea>`, 4, '<textarea>${…}</textarea>');
    // Not form state: a Gyral component's props, and <meter>'s value.
    expect(() => normalize(t`<my-input .value=${0}></my-input>`)).not.toThrow();
    expect(() => normalize(t`<meter .value=${0}></meter>`)).not.toThrow();
  });

  it('rule 5: unquoted multi-part attributes, and static text with ? or .', () => {
    expectRule(t`<b class=a${0}></b>`, 5, 'without quotes', 'class="a ${…}"');
    expectRule(t`<b class=${0}a></b>`, 5, 'without quotes');
    expectRule(t`<b class=${0}${1}></b>`, 5, 'without quotes');
    expectRule(t`<b ?hidden="x ${0}"></b>`, 5, 'exactly one value', '?hidden=${…}');
    expectRule(t`<b .p="${0}${1}"></b>`, 5, 'exactly one value');
  });

  it('rule 6: self-closing custom (and other non-void HTML) elements', () => {
    expectRule(t`<my-el />`, 6, 'not self-closing', '<my-el></my-el>');
    expectRule(t`<div/>`, 6, '<div></div>');
    expect(() => normalize(t`<input /><br/><svg><path /></svg>`)).not.toThrow();
  });

  it('rule 7: table structure the parser repairs', () => {
    expectRule(
      t`<table><tr><td>${0}</td></tr></table>`,
      7,
      '<tr> directly inside <table>',
      '<tbody>',
    );
    expectRule(t`<table><td></td></table>`, 7, '<td> directly inside <table>');
    expectRule(t`<table><tbody><td></td></tbody></table>`, 7, 'Wrap cells in <tr>');
    expectRule(t`<table><div></div></table>`, 7, 'moves it out of the table');
    expectRule(t`<table><tbody><tr>x</tr></tbody></table>`, 7, 'Text directly inside table');
    expectRule(t`<div><td></td></div>`, 7, 'outside its table structure');
    expectRule(t`<p>a<tr></tr></p>`, 7, 'outside its table structure');
  });

  it('rule 7: table parts at the template root follow the first start tag', () => {
    expect(() => normalize(t`<tr><td>${0}</td></tr><tr></tr>`)).not.toThrow();
    expect(() => normalize(t`<td>${0}</td><th></th>`)).not.toThrow();
    expect(() => normalize(t`<tbody></tbody><tfoot></tfoot>`)).not.toThrow();
    expectRule(t`<tr></tr><td></td>`, 7, 'Wrap cells in <tr>');
    expectRule(t`<div></div><tr></tr>`, 7, 'outside its table structure');
  });

  it('rule 7: block elements inside <p>', () => {
    expectRule(t`<p>a <div>b</div></p>`, 7, '<div> inside <p>', 'Close </p>');
    expectRule(t`<p><ul><li></li></ul></p>`, 7, '<ul> inside <p>');
    expectRule(t`<p><span><h2></h2></span></p>`, 7, '<h2> inside <p>');
    expect(() => normalize(t`<p><button><span>x</span></button></p>`)).not.toThrow();
    expect(() => normalize(t`<div><p>a</p><div>b</div></div>`)).not.toThrow();
  });

  it('rule 7: nested links, forms, buttons, headings, list items and options', () => {
    expectRule(t`<a href="/"><span><a href="/b"></a></span></a>`, 7, '<a> inside <a>');
    expectRule(t`<form><div><form></form></div></form>`, 7, '<form> inside <form>');
    expectRule(t`<button><button></button></button>`, 7, '<button> inside <button>');
    expectRule(t`<h1><h2></h2></h1>`, 7, 'inside a heading');
    expectRule(t`<ul><li><div><li></li></div></li></ul>`, 7, '<li> inside another <li>');
    expectRule(t`<dl><dt><dd></dd></dt></dl>`, 7, 'inside <dd> or <dt>');
    expectRule(t`<select><option><option></option></option></select>`, 7, 'inside <option>');
    // The parser does not repair these.
    expect(() => normalize(t`<div><li>a</li></div>`)).not.toThrow();
    expect(() => normalize(t`<ul><li><ul><li>a</li></ul></li></ul>`)).not.toThrow();
    expect(() =>
      normalize(t`<a href="/"><table><tbody><tr><td><a></a></td></tr></tbody></table></a>`),
    ).not.toThrow();
  });

  it('rule 7: HTML inside SVG ends the SVG', () => {
    expectRule(t`<svg><div></div></svg>`, 7, 'ends the <svg>', '<foreignObject>');
    expect(() =>
      normalize(t`<svg><foreignObject><div>${0}</div></foreignObject></svg>`),
    ).not.toThrow();
  });

  it('rule 7: end tags that do not match, and parser-created elements', () => {
    expectRule(t`<div><span></div>`, 7, '</div> while <span> is still open', 'Close </span>');
    expectRule(t`<div></span></div>`, 7, '</span> has no matching start tag');
    expectRule(t`<p>a</br></p>`, 7, 'creates an empty <br>', 'Write <br>');
    expectRule(t`<div></p></div>`, 7, 'creates an empty <p>');
    expect(() => normalize(t`<p><input></input></p>`)).not.toThrow();
  });

  it('rule 7: duplicate attributes and unterminated markup', () => {
    expectRule(t`<b class="a" class=${0}></b>`, 7, 'class appears twice', 'class="a ${…}"');
    expectRule(t`<b class=${0} ?class=${1}></b>`, 7, 'appears twice');
    expectRule(t`<p>${0}<b`, 7, 'ends inside a tag');
    expectRule(t`<a href=${0}`, 7, 'ends inside a tag');
    expectRule(t`<p>${0}<!-- x`, 7, 'ends inside a comment');
    expectRule(t`<p>a </> b</p>`, 7, 'must start an end tag', '&lt;/');
  });

  it('rule 10: SVG-only elements outside <svg>', () => {
    expectRule(t`<g>${0}</g>`, 10, '<g> is an SVG element outside an <svg>', 'svg`<g', 'wrap it');
    expectRule(t`<div><path d=${0}></path></div>`, 10, '<path>');
    expect(() => normalize(t`<svg><g><path d=${0}></path></g></svg>`)).not.toThrow();
  });

  it('rule 12 (proposed): a text-content hole is the whole content', () => {
    expectRule(t`<title>${0} | Site</title>`, 12, '<title>${…}</title>');
    expectRule(t`<textarea>a ${0}</textarea>`, 12, 'whole content');
  });

  it('rule 13 (proposed): unknown named references in decoded attribute text', () => {
    expectRule(t`<b class="&copy; ${0}"></b>`, 13, '&copy;', '&#169;');
    expectRule(t`<my-el label="&hellip;"></my-el>`, 13, '&hellip;');
    // Plain static attributes stay in the HTML for the browser to decode.
    expect(normalize(t`<b title="&copy;">${0}</b>`).html).toBe('<b title="&copy;"></b>');
  });
});
