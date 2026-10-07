// view/02-bindings.md "Attribute values", "Boolean attributes", "Properties" in Chromium: the
// value tables, multi-part joining, and that every part writes only when its value changes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { html, nothing } from '../../src/view/index.js';
import { draw, mount, watch } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('attribute values (view/02 "Attribute values")', () => {
  const view = (v: unknown) => html`<a href=${v}>x</a>`;

  it('writes strings and numbers, and booleans as "true"/"false"', () => {
    const el = mount();
    expect(draw(el, view('/a'))).toBe('<a href="/a">x</a>');
    expect(draw(el, view(3))).toBe('<a href="3">x</a>');
    expect(draw(el, html`<b aria-expanded=${true}></b>`)).toBe('<b aria-expanded="true"></b>');
    expect(draw(el, html`<b aria-expanded=${false}></b>`)).toBe('<b aria-expanded="false"></b>');
  });

  it('removes the attribute for null, undefined and nothing', () => {
    for (const absent of [null, undefined, nothing]) {
      const el = mount();
      draw(el, view('/a'));
      expect(draw(el, view(absent))).toBe('<a>x</a>');
      expect(draw(el, view('/b'))).toBe('<a href="/b">x</a>');
    }
  });

  it('writes only when the value changes', () => {
    const el = mount();
    draw(el, view('/a'));
    const changes = watch(el);
    draw(el, view('/a'));
    expect(changes.take()).toEqual([]);
    draw(el, view('/b'));
    expect(changes.take()).toHaveLength(1);
  });

  it('keeps static attributes and the attribute name as written in SVG', () => {
    const el = mount();
    draw(el, html`<svg viewBox=${'0 0 2 2'}><path d=${'M0 0'} /></svg>`);
    expect(el.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 2 2');
    expect(el.querySelector('path')?.getAttribute('d')).toBe('M0 0');
  });

  it('warns in development for objects and functions', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    draw(mount(), view({}));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('the attribute href got an object'));
  });
});

describe('multi-attributes (view/02 "Attribute values")', () => {
  const view = (a: unknown, b: unknown) => html`<p class="btn ${a} x-${b}"></p>`;

  it('joins the pieces with the static strings; null and undefined become empty', () => {
    const el = mount();
    expect(draw(el, view('big', 1))).toBe('<p class="btn big x-1"></p>');
    expect(draw(el, view(null, undefined))).toBe('<p class="btn  x-"></p>');
  });

  it('removes the attribute when any piece is nothing', () => {
    const el = mount();
    draw(el, view('a', 'b'));
    expect(draw(el, view('a', nothing))).toBe('<p></p>');
    expect(draw(el, view('a', 'c'))).toBe('<p class="btn a x-c"></p>');
  });

  it('writes only when the joined string changes', () => {
    const el = mount();
    draw(el, view('a', 'b'));
    const changes = watch(el);
    draw(el, view('a', 'b'));
    draw(el, view(null, 'b'));
    draw(el, view(undefined, 'b')); // same joined string
    expect(changes.take()).toHaveLength(1);
  });

  it('decodes character references in the static strings', () => {
    const el = mount();
    draw(el, html`<p title="a &amp; ${'b'} &lt;"></p>`);
    expect(el.querySelector('p')?.getAttribute('title')).toBe('a & b <');
  });
});

describe('boolean attributes (view/02 "Boolean attributes")', () => {
  const view = (v: unknown) => html`<button ?disabled=${v}>x</button>`;

  it('is present when truthy and absent when falsy or nothing', () => {
    const el = mount();
    expect(draw(el, view(true))).toBe('<button disabled="">x</button>');
    expect(draw(el, view(0))).toBe('<button>x</button>');
    expect(draw(el, view('yes'))).toBe('<button disabled="">x</button>');
    expect(draw(el, view(nothing))).toBe('<button>x</button>');
    expect(draw(el, view(undefined))).toBe('<button>x</button>');
  });

  it('writes only when the truthiness changes', () => {
    const el = mount();
    draw(el, view(1));
    const changes = watch(el);
    draw(el, view(true));
    draw(el, view('x'));
    expect(changes.take()).toEqual([]);
  });
});

describe('properties (view/02 "Properties")', () => {
  it('sets the property when !Object.is(value, committed)', () => {
    const el = mount();
    const set = vi.fn();
    class PropTarget extends HTMLElement {
      set items(v: unknown) {
        set(v);
      }
    }
    customElements.define('prop-target', PropTarget);
    const list = [1];
    const view = (v: unknown) => html`<prop-target .items=${v}></prop-target>`;
    draw(el, view(list));
    draw(el, view(list));
    draw(el, view([1]));
    draw(el, view(NaN));
    draw(el, view(NaN));
    expect(set.mock.calls).toEqual([[list], [[1]], [NaN]]);
  });

  it('keeps the case of property names', () => {
    const el = mount();
    draw(el, html`<div .someProp=${5}></div>`);
    expect((el.firstElementChild as unknown as { someProp: number }).someProp).toBe(5);
  });
});
