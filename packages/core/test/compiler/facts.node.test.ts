// The feature scan's reading of one module (src/compiler/facts.ts): spec-field names and
// command markup from the AST (comments and type-only code never count), and the specifiers
// through which a module may reach `raw`.
import { parseSync } from 'vite';
import { describe, expect, it } from 'vitest';
import type { Node } from '../../src/compiler/ast.js';
import { factsOf, writes, type Feature } from '../../src/compiler/facts.js';

const facts = (code: string) => factsOf(parseSync('module.ts', code).program as unknown as Node);
const uses = (code: string, feature: Feature): boolean => writes(facts(code), feature);

describe('facts: spec fields', () => {
  it.each([
    ['a property key', 'export const spec = { states: (s) => s };'],
    ['a shorthand property', 'const states = (s) => s; export const spec = { states };'],
    ['a quoted key', "export const spec = { 'states': (s) => s };"],
    ['an assignment', 'export const f = (spec) => { spec.states = () => ({}); };'],
    ['a method', 'export const spec = { states(s) { return s; } };'],
    ['a class field', 'export class Spec { states = () => ({}); }'],
    ['an exported binding (a namespace import may spread it)', 'export const states = 1;'],
    ['an export alias', 'const f = 1; export { f as states };'],
    ['an exact string', "Object.defineProperty(spec, 'states', { value: f });"],
    ['an exact template', 'spec[`states`] = f;'],
    ['an enum member', 'enum Keys { states }'],
  ])('count the name as %s', (_name, code) => {
    expect(uses(code, 'states')).toBe(true);
  });

  it.each([
    ['a comment', '// invalid object states\nexport const x = 1; /* states */'],
    ['a longer string', "export const x = 'record states of the binding';"],
    ['a template text', 'export const x = `binding states: ${1}`;'],
    ['a type', 'interface Spec { states: number }\ntype T = { states?: 1 };\nexport const x = 1;'],
    ['an import alone', "import { states } from './x';\nexport const x = 1;"],
  ])('ignore the name in %s', (_name, code) => {
    expect(uses(code, 'states')).toBe(false);
  });

  it('tell the three fields apart', () => {
    const f = facts('export const spec = { viewTransition: () => true };');
    expect([writes(f, 'transitions'), writes(f, 'frame'), writes(f, 'states')]).toEqual([
      true,
      false,
      false,
    ]);
    expect(uses("export const s = { renderOnFrame: ['Tick'] };", 'frame')).toBe(true);
  });
});

describe('facts: command intents', () => {
  it.each([
    ['a static data-intent-on="command"', 'html`<div data-intent-on="command"></div>`'],
    ['an unquoted one', 'html`<div data-intent-on=command></div>`'],
    ['any case in the attribute name', 'html`<div DATA-INTENT-ON="command"></div>`'],
    ['a bound data-intent-on', 'html`<div data-intent-on=${on}></div>`'],
    ['a quoted bound one', 'html`<div data-intent-on="${on}"></div>`'],
    ['a per-event command intent', 'html`<div data-intent-command="Run"></div>`'],
    ['a bound per-event command intent', 'html`<div data-intent-command=${i.Run}></div>`'],
    ['a setAttribute of one', "el.setAttribute('data-intent-command', 'Run');"],
    ['a list naming command', 'html`<div data-intent-on="focusin command"></div>`'],
    ['a list with a bound part', 'html`<div data-intent-on="keyup ${on}"></div>`'],
    ['markup in a string', `const m = '<i data-intent-on="command"></i>';`],
    ['an unfinished value in a string', `const m = '<i data-intent-on="' + on + '">';`],
    ['an exact "command"', "export const spec = { events: ['command'] };"],
    ['a setAttribute', "el.setAttribute('data-intent-on', 'command');"],
  ])('count %s', (_name, code) => {
    expect(uses(code, 'invokers')).toBe(true);
  });

  it.each([
    ['another event', 'html`<div data-intent-on="keydown"></div>`'],
    ['a longer name', 'html`<div data-intent-on="commander"></div>`'],
    ['another per-event intent', 'html`<div data-intent-keydown=${i.Run}></div>`'],
    ['a list without command', 'html`<div data-intent-on="pointerdown pointerup"></div>`'],
    ['a list with a longer name', 'html`<div data-intent-on="keyup my-command"></div>`'],
    ['comments', '// data-intent-on="command"\n/* events: ["command"] */ export const x = 1;'],
    ['the word in a longer string', "export const x = 'run a command';"],
    ['a type', "type E = 'command' | 'click';\nexport const x = 1;"],
  ])('ignore %s', (_name, code) => {
    expect(uses(code, 'invokers')).toBe(false);
  });
});

describe('facts: where raw may come from', () => {
  const sources = (code: string): readonly string[] => facts(code).rawSources;

  it('list a referenced import of raw, under any alias', () => {
    expect(sources("import { raw } from 'a'; export const t = raw('<p>');")).toEqual(['a']);
    expect(sources("import { raw as r } from 'b'; export const f = r;")).toEqual(['b']);
    expect(sources("import { 'raw' as r } from 'c'; r('');")).toEqual(['c']);
  });

  it('skip an unused or type-only import of raw, and other functions named raw', () => {
    expect(sources("import { raw } from 'a'; export const x = 1;")).toEqual([]);
    expect(sources("import type { raw } from 'a'; export const x = 1;")).toEqual([]);
    expect(sources("import { type raw } from 'a'; export const x = 1;")).toEqual([]);
    expect(sources('const raw = (s) => s; export const x = raw("<p>");')).toEqual([]);
    expect(sources('export const x = String.raw`a`;')).toEqual([]);
  });

  it('list a namespace import read as ns.raw, ns[key] or passed on, not ns.<other>', () => {
    expect(sources("import * as g from 'a'; g.raw('');")).toEqual(['a']);
    expect(sources("import * as g from 'a'; g['raw']('');")).toEqual(['a']);
    expect(sources("import * as g from 'a'; g[key]('');")).toEqual(['a']);
    expect(sources("import * as g from 'a'; use(g);")).toEqual(['a']);
    expect(sources("import * as g from 'a'; export { g };")).toEqual(['a']);
    expect(sources("import * as g from 'a'; g.define('x', {}); g['html'];")).toEqual([]);
    // Property names that spell the namespace's name are not references to it.
    expect(sources("import * as view from 'a'; export const s = { view: 1 }; s.view;")).toEqual([]);
    expect(sources("import * as view from 'a'; export const s = { view };")).toEqual(['a']);
  });

  it('list re-exports of raw, export * and dynamic imports', () => {
    expect(sources("export { raw } from 'a';")).toEqual(['a']);
    expect(sources("export { raw as trusted } from 'a';")).toEqual(['a']);
    expect(sources("export * from 'b';")).toEqual(['b']);
    expect(sources("export * as v from 'c';")).toEqual(['c']);
    expect(sources("import { raw } from 'd'; export { raw };")).toEqual(['d']);
    expect(sources("const m = await import('e');")).toEqual(['e']);
    expect(sources("export { html } from 'f';")).toEqual([]);
  });

  describe('dialogs (?modal, ?popover-open, gyral-1zd.27)', () => {
    it('counts a template that binds either', () => {
      expect(uses('html`<dialog ?modal=${open}></dialog>`;', 'dialogs')).toBe(true);
      expect(uses('html`<p popover ?popover-open=${on}></p>`;', 'dialogs')).toBe(true);
    });
    it("doesn't count the words alone", () => {
      expect(uses("const modal = 'popover-open'; html`<dialog ?open=${x}>`;", 'dialogs')).toBe(
        false,
      );
    });
  });

  describe('features reached by a key or a message name (gyral-1zd.24, gyral-1zd.17)', () => {
    it('counts a hook spec that names dispose', () => {
      expect(uses('defineHook({ client() {}, dispose() {} });', 'disposal')).toBe(true);
      expect(uses('defineHook({ client() {} });', 'disposal')).toBe(false);
    });
    it('counts an error view and an Errored reducer', () => {
      expect(uses('define()("x", { view, error: () => html`oops` });', 'errorView')).toBe(true);
      expect(uses('const update = { Errored: (s) => s };', 'errored')).toBe(true);
      expect(uses('const update = { Saved: (s) => s };', 'errored')).toBe(false);
    });
    it('counts the error spec field by position only (gyral-1zd.29)', () => {
      // A spec object passed to define(), inline or through a const (and its spreads).
      expect(uses('define()("x", { view, error: errorView });', 'errorView')).toBe(true);
      expect(
        uses('const spec = { view, error: errorView }; define()("x", spec);', 'errorView'),
      ).toBe(true);
      expect(
        uses('const base = { error: errorView }; define()("x", { ...base, view });', 'errorView'),
      ).toBe(true);
      expect(uses('ns.define()("x", { view, error: errorView });', 'errorView')).toBe(true);
      // Elsewhere: a function value, a method, a shorthand, a member assignment of a function.
      expect(uses('export const spec = { error: (f, s) => html`x` };', 'errorView')).toBe(true);
      expect(uses('export const spec = { error(f, s) { return html`x`; } };', 'errorView')).toBe(
        true,
      );
      expect(uses('const error = (f) => f; export const spec = { error };', 'errorView')).toBe(
        true,
      );
      expect(uses('export const f = (spec) => { spec.error = () => html`x`; };', 'errorView')).toBe(
        true,
      );
      // Not: a state field, a non-spec object, catch bindings, strings, message tags.
      expect(
        uses('const update = { Failed: (s, m) => ({ ...s, error: m.message }) };', 'errorView'),
      ).toBe(false);
      expect(uses('const init = () => ({ items: [], error: null });', 'errorView')).toBe(false);
      expect(uses('const options = { error: "Enter a name." };', 'errorView')).toBe(false);
      expect(uses('try { run(); } catch (error) { console.error(error); }', 'errorView')).toBe(
        false,
      );
      expect(uses('const msg = { _tag: "error", level: "error" };', 'errorView')).toBe(false);
      expect(uses('state.error = message;', 'errorView')).toBe(false);
    });
    it("doesn't count the words in comments", () => {
      expect(uses('// dispose, error, Errored\nexport const x = 1;', 'disposal')).toBe(false);
      expect(uses('// Errored\nexport const x = 1;', 'errored')).toBe(false);
    });
  });
});
