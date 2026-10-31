// view/09-template-rules.md "Errors": every rule the normalizer checks from one template's
// strings throws a TemplateError with its rule number, a message saying what is wrong and what
// to write instead (core belief 7), and the call site's loc.
import { describe, expect, it } from 'vitest';
import { TemplateError } from '../../src/view/normalize/errors.js';
import { nameChecks } from '../../src/view/normalize/component-name.js';
import { analyze, normalize } from '../../src/view/normalize/normalize.js';
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

  it('rule 3: holes in <noscript>, whose content only the server writes (gyral-qqa)', () => {
    expectRule(t`<noscript>${0}</noscript>`, 3, 'inside <noscript>', 'static markup');
    expectRule(t`<noscript><a href=${0}>Upload</a></noscript>`, 3, 'inside <noscript>');
    expect(() => normalize(t`<noscript class=${0}><p>No JavaScript</p></noscript>`)).not.toThrow();
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

  it('rule 14: boolean attributes bound as strings', () => {
    // The shipped bug: selected="false" still selects the option.
    expectRule(
      t`<option value="x" selected=${false}></option>`,
      14,
      'selected=${…}',
      '?selected=${…}',
    );
    expectRule(t`<input disabled=${0}>`, 14, '?disabled=${…}', '"false"');
    expectRule(t`<details open="${0}"></details>`, 14, '?open=${…}');
    expectRule(t`<input DISABLED=${0}>`, 14, '?disabled=${…}');
    expectRule(t`<video muted="a ${0}"></video>`, 14, '?muted=${…}');
    // Fine: the boolean form, static attributes, custom elements, SVG, and hidden="until-found".
    expect(() => normalize(t`<option value="x" ?selected=${false}></option>`)).not.toThrow();
    expect(() => normalize(t`<option value="x" selected></option>`)).not.toThrow();
    expect(() => normalize(t`<my-panel open=${0}></my-panel>`)).not.toThrow();
    expect(() => normalize(t`<div hidden=${'until-found'}></div>`)).not.toThrow();
  });

  it('rule 15: a PascalCase tag is not a component reference', () => {
    // Agents write JSX-style tags; HTML reads <SignupForm> as an unknown <signupform>.
    expectRule(
      t`<main><SignupForm></SignupForm></main>`,
      15,
      '<SignupForm>',
      'unknown <signupform>',
      '<signup-form></signup-form>',
      'import the module',
    );
    expectRule(t`<TaskApp></TaskApp>`, 15, '<task-app></task-app>');
    expectRule(t`<Counter />`, 15, '<my-counter></my-counter>');
    expectRule(t`<div><Card title=${0}></Card></div>`, 15, '<card>');
    // Fine: tag names, whatever their case, that HTML knows or that can be custom elements.
    expect(() => normalize(t`<DIV><IFrame></IFrame><TBody-x></TBody-x></DIV>`)).not.toThrow();
    expect(() => normalize(t`<Signup-Form></Signup-Form>`)).not.toThrow();
    expect(() => normalize(t`<svg><LinearGradient></LinearGradient></svg>`)).not.toThrow();
    expect(() => normalize(t`<signupform></signupform>`)).not.toThrow();
    // The runtime preparer passes the check only in development (prepare.ts).
    expect(() => analyze(t`<SignupForm></SignupForm>`)).not.toThrow();
    expect(() => analyze(t`<SignupForm></SignupForm>`, undefined, false, nameChecks)).toThrow(
      TemplateError,
    );
  });

  it('rule 16: a camelCase attribute on a custom element', () => {
    // HTML reads playerBase as playerbase; a prop playerBase reads player-base.
    expectRule(
      t`<pool-card playerBase=${0}></pool-card>`,
      16,
      '<pool-card> playerBase',
      '"playerbase"',
      'player-base=${…}',
      '.playerBase=${…}',
    );
    expectRule(t`<my-el isOpen="yes"></my-el>`, 16, 'is-open=${…}');
    expectRule(t`<my-el ?isOpen=${0}></my-el>`, 16, '?is-open=${…}', '.isOpen=${…}');
    expectRule(t`<div><my-el class="a" maxItems="3"></my-el></div>`, 16, 'max-items');
    // Fine: kebab-case and lower case, properties, built-in elements, and SVG's camelCase.
    expect(() =>
      normalize(t`<my-el player-base=${0} playerbase=${1} .playerBase=${2}></my-el>`),
    ).not.toThrow();
    expect(() => normalize(t`<div tabIndex=${0} contentEditable="true"></div>`)).not.toThrow();
    expect(() =>
      normalize(t`<svg viewBox="0 0 1 1"><path pathLength="1"></path></svg>`),
    ).not.toThrow();
    // The runtime preparer passes the check only in development (prepare.ts).
    expect(() => analyze(t`<my-el fooBar=${0}></my-el>`)).not.toThrow();
    expect(() => analyze(t`<my-el fooBar=${0}></my-el>`, undefined, false, nameChecks)).toThrow(
      TemplateError,
    );
  });

  it('rule 4: dialog and popover state only as ?modal / ?popover-open where they fit', () => {
    expectRule(t`<dialog modal=${0}></dialog>`, 4, '?modal=${…}');
    expectRule(t`<dialog .modal=${0}></dialog>`, 4, '?modal=${…}');
    expectRule(t`<div ?modal=${0}></div>`, 4, 'only a <dialog>');
    expectRule(t`<div ?popover-open=${0}></div>`, 4, 'popover attribute');
    expectRule(t`<div popover popover-open=${0}></div>`, 4, '?popover-open=${…}');
    expect(() => normalize(t`<dialog ?modal=${0}></dialog>`)).not.toThrow();
    expect(() => normalize(t`<p popover="manual" ?popover-open=${0}></p>`)).not.toThrow();
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
