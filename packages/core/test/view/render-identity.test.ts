// view/02-bindings.md "Child values" with template objects as a production client build
// carries them (view/01-templates.md "Template ids"): no id, so the renderer compares them by
// identity. The same object patches; another object replaces, even with the same structure.
// Objects with ids (the runtime path, development builds) still match by id.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compiled, each, normalize, type TemplateObject } from '../../src/view/index.js';
import { clientObject } from './helpers.js';
import { draw, mount } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** A template object as a production client build hoists it: no id, no segments. */
const object = (strings: readonly string[]): TemplateObject =>
  clientObject(normalize(strings), true);

const row = object(['<li>', '</li>']);
const list = object(['<ul>', '</ul>']);

describe('templates without ids (production client builds)', () => {
  const card = object(['<p class="card">', '</p>']);
  const twin = object(['<p class="card">', '</p>']);
  const other = object(['<span>', '</span>']);
  const outer = object(['<div>', '</div>']);

  it('has no id to compare', () => {
    expect(card).not.toHaveProperty('id');
    expect(card).toEqual(twin);
    expect(card).not.toBe(twin);
  });

  it('patches the instance when the same object renders again', () => {
    const el = mount();
    draw(el, compiled(outer, [compiled(card, ['one'])]));
    const p = el.querySelector('p');
    const text = p?.firstChild;
    expect(draw(el, compiled(outer, [compiled(card, ['two'])]))).toBe(
      '<div><p class="card">two</p></div>',
    );
    expect(el.querySelector('p')).toBe(p);
    expect(p?.firstChild).toBe(text);
  });

  it('replaces the instance when switching between two objects, back and forth', () => {
    const el = mount();
    draw(el, compiled(outer, [compiled(card, ['a'])]));
    const first = el.querySelector('p');
    expect(draw(el, compiled(outer, [compiled(other, ['b'])]))).toBe('<div><span>b</span></div>');
    expect(first?.isConnected).toBe(false);
    expect(draw(el, compiled(outer, [compiled(card, ['c'])]))).toBe(
      '<div><p class="card">c</p></div>',
    );
    expect(el.querySelector('p')).not.toBe(first);
  });

  it('replaces the instance for another object with the same structure (another call site)', () => {
    const el = mount();
    draw(el, compiled(outer, [compiled(card, ['a'])]));
    const p = el.querySelector('p');
    expect(draw(el, compiled(outer, [compiled(twin, ['b'])]))).toBe(
      '<div><p class="card">b</p></div>',
    );
    expect(p?.isConnected).toBe(false);
  });

  it('patches the root instance and list rows rendered from the same object', () => {
    const el = mount();
    const view = (items: readonly string[]) =>
      compiled(list, [
        each(
          items,
          (x) => x,
          (x) => compiled(row, [x]),
        ),
      ]);
    draw(el, view(['a', 'b']));
    const ul = el.querySelector('ul');
    const lis = [...el.querySelectorAll('li')];
    expect(draw(el, view(['b', 'a', 'c']))).toBe('<ul><li>b</li><li>a</li><li>c</li></ul>');
    expect(el.querySelector('ul')).toBe(ul);
    expect([...el.querySelectorAll('li')].slice(0, 2)).toEqual([lis[1], lis[0]]);
  });

  it('still matches objects with the same id (runtime path, development builds)', () => {
    const el = mount();
    const a = clientObject(normalize(['<p class="card">', '</p>']));
    const b = clientObject(normalize(['<p class="card">', '</p>']));
    expect(a).not.toBe(b);
    draw(el, compiled(outer, [compiled(a, ['a'])]));
    const p = el.querySelector('p');
    expect(draw(el, compiled(outer, [compiled(b, ['b'])]))).toBe(
      '<div><p class="card">b</p></div>',
    );
    expect(el.querySelector('p')).toBe(p);
  });
});
