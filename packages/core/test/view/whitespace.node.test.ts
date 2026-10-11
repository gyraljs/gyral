// view/01-templates.md "Whitespace": ported from core's template-whitespace tests (gyral-9rf).
import { describe, expect, it } from 'vitest';
import { minifyStrings } from '../../src/view/normalize/whitespace.js';

/** Template strings for a tagged literal. */
const t = (strings: TemplateStringsArray, ...values: unknown[]): TemplateStringsArray =>
  values.length >= 0 ? strings : strings;
const min = (strings: TemplateStringsArray): string[] => minifyStrings(strings);

describe('whitespace (view/01 "Whitespace")', () => {
  it('removes indentation between block tags and at template edges', () => {
    expect(
      min(t`
        <tr>
          <td>${1}</td>
          <td><a>${2}</a></td>
        </tr>
      `),
    ).toEqual(['<tr><td>', '</td><td><a>', '</a></td></tr>']);
  });

  it('keeps one space between inline neighbours, including across lines', () => {
    expect(min(t`a <b>b</b> c`)).toEqual(['a <b>b</b> c']);
    expect(
      min(t`<span>a</span>
      <span>b</span>`),
    ).toEqual(['<span>a</span> <span>b</span>']);
    expect(
      min(t`<em>${'x'}</em>
      ${'y'}`),
    ).toEqual(['<em>', '</em> ', '']);
  });

  it('treats custom elements as inline (a space survives between them)', () => {
    expect(
      min(t`<gy-a></gy-a>
      <gy-b></gy-b>`),
    ).toEqual(['<gy-a></gy-a> <gy-b></gy-b>']);
  });

  it('collapses runs of whitespace inside text to one space', () => {
    expect(
      min(t`<p>Hello,
        world   and  you</p>`),
    ).toEqual(['<p>Hello, world and you</p>']);
  });

  it('leaves <pre>, <textarea>, <script>, <style> and <title> contents alone', () => {
    const pre = t`<pre>
  a   b
    <b> c </b>
</pre>`;
    expect(min(pre)).toEqual([...pre]);
    const area = t`<textarea>
  ${'v'}   x
</textarea>`;
    expect(min(area)).toEqual([...area]);
    const style = t`<style>
  p   { color: red }
</style>`;
    expect(min(style)).toEqual([...style]);
    expect(min(t`<script>  let a  =  1 </script>`)).toEqual(['<script>  let a  =  1 </script>']);
  });

  it('never changes tags, attribute values or attribute bindings', () => {
    const strings = t`<div
        class="a   b"
        title='x
          y'
        data-v=${1}
        .prop=${2}
      >  text  </div>`;
    const out = min(strings);
    expect(out).toHaveLength(strings.length);
    expect(out[0]).toBe(`<div
        class="a   b"
        title='x
          y'
        data-v=`);
    expect(out[2]).toBe(`
      > text </div>`);
  });

  it('keeps comments, and a space around them between inline content', () => {
    expect(
      min(t`<span>a</span>
      <!-- note   here -->
      <span>b</span>`),
    ).toEqual(['<span>a</span> <!-- note   here --> <span>b</span>']);
    expect(
      min(t`<div></div>
      <!-- x -->`),
    ).toEqual(['<div></div><!-- x -->']);
  });

  it('minifies svg between shapes but keeps text spacing', () => {
    expect(
      min(t`<svg viewBox="0 0 10 10">
        <g>
          <circle r="1"></circle>
          <text>a  b</text>
        </g>
      </svg>`),
    ).toEqual(['<svg viewBox="0 0 10 10"><g><circle r="1"></circle><text>a b</text></g></svg>']);
  });

  it('drops whitespace with a newline at the inside edges of <svg> (svg fragments in holes)', () => {
    expect(
      min(t`<p>a <svg viewBox="0 0 1 1">
        ${'fragment'}
      </svg> b</p>`),
    ).toEqual(['<p>a <svg viewBox="0 0 1 1">', '</svg> b</p>']);
  });

  it('keeps binding positions in nested templates', () => {
    const strings = t`
      <ul>
        ${'items'}
      </ul>
      <p>${'a'} and ${'b'}</p>
    `;
    const out = min(strings);
    expect(out).toEqual(['<ul>', '</ul><p>', ' and ', '</p>']);
  });

  it('removes whitespace between head-only tags, and anywhere inside <head>', () => {
    expect(
      min(t`<head>
        <meta charset="utf-8" />
        <title>${'T'}</title>
        <link rel="icon" href="/i.svg" />
        ${1}
        ${2}
      </head>`),
    ).toEqual([
      '<head><meta charset="utf-8" /><title>',
      '</title><link rel="icon" href="/i.svg" />',
      '',
      '</head>',
    ]);
    // On one line too (Prettier joins short lines): nothing in <head> renders.
    expect(min(t`<head>${1} ${2} <meta charset="utf-8" /></head>`)).toEqual([
      '<head>',
      '',
      '<meta charset="utf-8" /></head>',
    ]);
    // A fragment written for the head: the tags themselves are block edges.
    expect(
      min(t`<meta name="a" content="b" />
        <link rel="stylesheet" href="/s.css" />
        <base href="/" />`),
    ).toEqual([
      '<meta name="a" content="b" /><link rel="stylesheet" href="/s.css" /><base href="/" />',
    ]);
    // <body> ends the head: inline neighbours keep their space again.
    expect(
      min(t`<head><title>x</title><body>${1}
        ${2}</body>`),
    ).toEqual(['<head><title>x</title><body>', ' ', '</body>']);
  });

  it('treats a lone < as text', () => {
    expect(min(t`<p>a < b</p>`)).toEqual(['<p>a < b</p>']);
  });

  it('is idempotent', () => {
    const samples = [
      t`
        <tr>
          <td>${1}</td>
        </tr>`,
      t`<span>a</span>
        <span>b</span>`,
      t`<pre>
 x </pre>
        <p> y </p>`,
      t`<head>
          <meta charset="utf-8" />
          ${1}
          ${2}
        </head>
        <body>${3} ${4}</body>`,
    ];
    for (const strings of samples) {
      const once = minifyStrings(strings);
      expect(minifyStrings(once)).toEqual(once);
    }
  });
});

describe('mixed text next to block edges (gyral-9rf)', () => {
  it('drops a newline run at the start or end of a block, keeps it between inline words', () => {
    expect(minifyStrings(['<p>\n  Hello <b>x</b>\n  again\n</p>'])).toEqual([
      '<p>Hello <b>x</b> again</p>',
    ]);
    expect(minifyStrings(['<button>\n  Save\n</button>'])).toEqual(['<button>Save</button>']);
    expect(minifyStrings(['<span>\n  a\n</span>'])).toEqual(['<span> a </span>']);
  });
});
