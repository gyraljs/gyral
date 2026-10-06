// view/02-bindings.md "The anchor rule" and view/01-templates.md "Normalization" step 4 (paths).
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/view/normalize/normalize.js';
import { readable, t } from './helpers.js';

describe('the anchor rule (view/02)', () => {
  it('anchors a hole followed by static text', () => {
    const n = normalize(t`<p>Hello ${'a'}!</p>`);
    expect(n.html).toBe('<p>Hello <!---->!</p>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0], ref: 1, sole: false }]);
  });

  it('anchors the first of two adjacent holes; the second inserts at the end', () => {
    const n = normalize(t`<p>${'a'}${'b'}</p>`);
    expect(n.html).toBe('<p><!----></p>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'child', path: [0], ref: 0, sole: false },
      { k: 'child', path: [0], ref: null, sole: false },
    ]);
  });

  it('needs no anchor for a sole hole', () => {
    const n = normalize(t`<td>${'x'}</td>`);
    expect(n.html).toBe('<td></td>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0], ref: null, sole: true }]);
  });

  it('inserts before the next static element without an anchor', () => {
    const n = normalize(t`<p>${'a'}<b>x</b></p>`);
    expect(n.html).toBe('<p><b>x</b></p>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0], ref: 0, sole: false }]);
  });

  it('inserts before the next static comment without an anchor', () => {
    const n = normalize(t`<p>${'a'}<!-- note --></p>`);
    expect(n.html).toBe('<p><!-- note --></p>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0], ref: 0, sole: false }]);
  });

  it('inserts at the end of the parent for a last hole', () => {
    const n = normalize(t`<p><b>x</b> and ${'a'}</p>`);
    expect(n.html).toBe('<p><b>x</b> and </p>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0], ref: null, sole: false }]);
  });

  it('has no anchors in the benchmark row', () => {
    const n = normalize(t`
      <tr>
        <td>${1}</td>
        <td><a>${'label'}</a></td>
        <td><a><span aria-hidden="true"></span></a></td>
      </tr>`);
    expect(n.html).not.toContain('<!---->');
    expect(n.parts.map((p) => readable(p)).map((p) => p.k === 'child' && p.sole)).toEqual([
      true,
      true,
    ]);
  });

  it('works at the template root', () => {
    expect(normalize(t`${'x'}`).parts.map(readable)).toEqual([
      { k: 'child', path: [], ref: null, sole: true },
    ]);
    const n = normalize(t`a ${'x'} b`);
    expect(n.html).toBe('a <!----> b');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [], ref: 1, sole: false }]);
  });

  it('adds no anchors to a server template: a page shell is never hydrated (06)', () => {
    const n = normalize(t`<html><body>${'a'} text ${'b'}${'c'}<p>${'d'}!</p></body></html>`);
    expect(n.server).toBe(true);
    expect(n.html).toBe('<html><body> text <p>!</p></body></html>');
    expect(n.segments?.filter((s) => typeof s === 'string')).toEqual([
      '<html><body>',
      ' text ',
      '<p>',
      '!</p></body></html>',
    ]);
  });
});

describe('paths (view/01 step 4)', () => {
  it('counts element, text and comment children, including anchors', () => {
    const n = normalize(t`<div>a <!-- c --> <span>${1}</span> ${2} x <i id=${3}></i></div>`);
    // div: "a ", <!-- c -->, " ", <span>, " ", anchor, " x ", <i>
    expect(n.html).toBe('<div>a <!-- c --> <span></span> <!----> x <i></i></div>');
    expect(n.parts.map(readable)).toEqual([
      { k: 'child', path: [0, 3], ref: null, sole: true },
      { k: 'child', path: [0], ref: 5, sole: false },
      { k: 'attr', path: [0, 7], name: 'id' },
    ]);
  });

  it('skips void elements and self-closed SVG elements correctly', () => {
    const n = normalize(t`<p><img src="a.png"><br><svg><path d="M0"/><circle r=${1} /></svg></p>`);
    expect(n.html).toBe('<p><img src="a.png"><br><svg><path d="M0"/><circle/></svg></p>');
    expect(n.parts.map(readable)).toEqual([{ k: 'attr', path: [0, 2, 1], name: 'r' }]);
  });

  it('drops the newline the parser drops after <pre>', () => {
    const n = normalize(['<pre>\n<b>', '</b></pre>']);
    expect(n.html).toBe('<pre><b></b></pre>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0, 0], ref: null, sole: true }]);
  });

  it('gives a hole right after <pre>/<textarea> a newline to drop', () => {
    expect(normalize(t`<pre>${'x'}</pre>`).html).toBe('<pre>\n</pre>');
    expect(normalize(t`<textarea>${'x'}</textarea>`).html).toBe('<textarea>\n</textarea>');
  });

  it('closes elements left open at the end', () => {
    const n = normalize(t`<div><span>${1}`);
    expect(n.html).toBe('<div><span></span></div>');
    expect(n.parts.map(readable)).toEqual([{ k: 'child', path: [0, 0], ref: null, sole: true }]);
  });
});
