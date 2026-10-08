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
});
