// view/02-bindings.md "Hole kinds", as classified by the tokenizer (view/01-templates.md
// "Normalization" step 1): one test per kind, plus the tokenizer states that hold no hole.
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/view/normalize/normalize.js';
import { t } from './helpers.js';

const kinds = (strings: readonly string[]): unknown[] =>
  normalize(strings).parts.map((part) => {
    const { path, ...rest } = part;
    return path.length >= 0 ? rest : part;
  });

describe('hole kinds (view/02)', () => {
  it('child: between tags', () => {
    expect(kinds(t`<p>Hello ${'name'}!</p>`)).toEqual([{ k: 'child', ref: 1, sole: false }]);
  });

  it('child (sole): an element’s only content', () => {
    expect(kinds(t`<td>${1}</td>`)).toEqual([{ k: 'child', ref: null, sole: true }]);
  });

  it('attribute: unquoted, quoted with only the hole, spaces around =', () => {
    expect(kinds(t`<a href=${'u'}></a>`)).toEqual([{ k: 'attr', name: 'href' }]);
    expect(kinds(t`<a href="${'u'}"></a>`)).toEqual([{ k: 'attr', name: 'href' }]);
    expect(kinds(t`<a title='${'u'}'></a>`)).toEqual([{ k: 'attr', name: 'title' }]);
    expect(kinds(t`<a href = ${'u'}></a>`)).toEqual([{ k: 'attr', name: 'href' }]);
    expect(kinds(t`<input value=${'v'}/>`)).toEqual([{ k: 'attr', name: 'value' }]);
  });

  it('attribute names are lower-cased on HTML elements, kept on SVG elements', () => {
    expect(kinds(t`<div DATA-Intent=${1}></div>`)).toEqual([{ k: 'attr', name: 'data-intent' }]);
    expect(kinds(t`<svg viewBox=${1}></svg>`)).toEqual([{ k: 'attr', name: 'viewBox' }]);
  });

  it('multi-attribute: quoted, with static pieces (decoded)', () => {
    expect(kinds(t`<b class="btn ${'k'} x-${'y'}"></b>`)).toEqual([
      { k: 'attr', name: 'class', strings: ['btn ', ' x-', ''] },
    ]);
    expect(kinds(t`<b title="${1}${2}"></b>`)).toEqual([
      { k: 'attr', name: 'title', strings: ['', '', ''] },
    ]);
    expect(kinds(t`<b title="a &amp; &#65;&#x42; ${1}"></b>`)).toEqual([
      { k: 'attr', name: 'title', strings: ['a & AB ', ''] },
    ]);
  });

  it('boolean: ?name', () => {
    expect(kinds(t`<button ?disabled=${true}></button>`)).toEqual([
      { k: 'bool', name: 'disabled' },
    ]);
  });

  it('property: .name keeps its case', () => {
    expect(kinds(t`<my-list .someItems=${[]}></my-list>`)).toEqual([
      { k: 'prop', name: 'someItems' },
    ]);
  });

  it('hook: a hole inside a start tag, in any attribute-free position', () => {
    expect(kinds(t`<input ${'h'}>`)).toEqual([{ k: 'hook' }]);
    expect(kinds(t`<input disabled ${'h'} ${'g'}>`)).toEqual([{ k: 'hook' }, { k: 'hook' }]);
    expect(kinds(t`<input name="a"${'h'}>`)).toEqual([{ k: 'hook' }]);
    expect(kinds(t`<input ${'h'}/>`)).toEqual([{ k: 'hook' }]);
    expect(kinds(t`<input ${'h'}${'g'}>`)).toEqual([{ k: 'hook' }, { k: 'hook' }]);
  });

  it('text content: <textarea> and <title>', () => {
    expect(kinds(t`<textarea>${'m'}</textarea>`)).toEqual([{ k: 'text' }]);
    expect(kinds(t`<title>${'t'}</title>`)).toEqual([{ k: 'text' }]);
    // A <textarea>'s first newline is dropped by the parser, so it may precede the hole.
    expect(kinds(['<textarea>\n', '</textarea>'])).toEqual([{ k: 'text' }]);
  });

  it('a <title> inside <svg> is an SVG element: a child hole', () => {
    expect(kinds(t`<svg><title>${'t'}</title></svg>`)).toEqual([
      { k: 'child', ref: null, sole: true },
    ]);
  });

  it('keeps holes in source order across attributes and children', () => {
    const n = normalize(t`<a href=${0} ${1}>${2}<b class="x ${3}" .p=${4}>${5}</b></a>`);
    expect(n.parts.map((p) => p.k)).toEqual(['attr', 'hook', 'child', 'attr', 'prop', 'child']);
  });
});

describe('tokenizer states without holes', () => {
  it('copies comments, bogus comments and raw text verbatim', () => {
    expect(normalize(t`<!-- a <b> --><p>x</p>`).html).toBe('<!-- a <b> --><p>x</p>');
    expect(normalize(t`<!--><!---><p>${1}</p>`).html).toBe('<!--><!---><p></p>');
    expect(normalize(t`<?xml x?><p></p>`).html).toBe('<?xml x?><p></p>');
    expect(normalize(t`<style>p > a { color: red }</style>`).html).toBe(
      '<style>p > a { color: red }</style>',
    );
    expect(normalize(t`<script>if (a < b && c) {}</script>`).html).toBe(
      '<script>if (a < b && c) {}</script>',
    );
  });

  it('treats a lone < as text', () => {
    const n = normalize(t`<p>a < b ${1}</p>`);
    expect(n.html).toBe('<p>a < b </p>');
  });

  it('keeps static attributes as written, minus bound ones', () => {
    const n = normalize(t`<input type="checkbox" disabled name='a' data-x=1 ?checked=${1}>`);
    expect(n.html).toBe(`<input type="checkbox" disabled name='a' data-x=1>`);
  });

  it('marks document-level templates as server templates', () => {
    expect(normalize(t`<!doctype html><html><body>${1}</body></html>`).server).toBe(true);
    expect(normalize(t`<head><title>${1}</title></head>`).server).toBe(true);
    expect(normalize(t`<main>${1}</main>`).server).toBe(false);
  });
});
