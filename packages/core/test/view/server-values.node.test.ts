// view/06-server.md "Writing a template result": child values, attributes, booleans,
// properties, hooks, text content and form state written from segments, with the escaping,
// anchors and development markers the spec names.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compiled,
  defineHook,
  each,
  html,
  nothing,
  raw,
  templateOf,
} from '../../src/view/index.js';
import { normalize } from '../../src/view/normalize/normalize.js';
import { renderToString } from '../../src/server.js';
import { clientObject } from './helpers.js';

const prod = (value: unknown) => renderToString(value as never, { dev: false });
const dev = (value: unknown) => renderToString(value as never, { dev: true });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('child values (02 "Child values")', () => {
  it('escapes text: & < > only', () => {
    expect(prod(html`<p>${`a & <b> "q" 'x'`}</p>`)).toBe(`<p>a &amp; &lt;b&gt; "q" 'x'</p>`);
    expect(prod(html`<p>${42}</p>`)).toBe('<p>42</p>');
  });

  it('writes nothing for null, undefined, false, nothing and empty strings', () => {
    for (const v of [null, undefined, false, nothing, '']) {
      expect(prod(html`<p>${v}</p>`)).toBe('<p></p>');
    }
  });

  it('warns for true in development and writes nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const site = (v: unknown) => html`<p>${v}</p>`;
    expect(dev(site(true))).toMatch(/<p><\/p>$/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('`true` in a child hole'));
  });

  it('writes the anchors of the template HTML, and only those', () => {
    const t = html`<p>Hi ${'Ada'}!</p>
      <ul>
        ${'x'}${'y'}
      </ul>
      ${1}
      <hr />`;
    expect(prod(t)).toBe('<p>Hi Ada<!---->!</p><ul>x<!---->y</ul>1<hr>');
  });

  it('writes nested templates, arrays and each() rows one after another, without markers', () => {
    const row = (n: number) => html`<li>${n}</li>`;
    expect(
      prod(
        html`<ul>
          ${each([1, 2], (n) => n, row)}
        </ul>`,
      ),
    ).toBe('<ul><li>1</li><li>2</li></ul>');
    expect(
      prod(
        html`<ul>
          ${[row(3), 'four', [row(5)]]}
        </ul>`,
      ),
    ).toBe('<ul><li>3</li>four<li>5</li></ul>');
  });

  it('passes pick results to rows', () => {
    const items = [{ id: 1 }, { id: 2 }];
    const out = prod(
      html`<ol>
        ${each(
          items,
          (it) => it.id,
          (it, on: boolean) => html`<li class=${on ? 'on' : null}>${it.id}</li>`,
          (it) => it.id === 2,
        )}
      </ol>`,
    );
    expect(out).toBe('<ol><li>1</li><li class="on">2</li></ol>');
  });

  it('rejects duplicate keys in development', () => {
    const list = each(
      [1, 1],
      (n) => n,
      (n) => html`<i>${n}</i>`,
    );
    expect(() => dev(html`<p>${list}</p>`)).toThrow(/appears twice/);
    expect(prod(html`<p>${list}</p>`)).toBe('<p><i>1</i><i>1</i></p>');
  });

  it('writes raw() verbatim after an anchor comment', () => {
    expect(prod(html`<div>${raw('<b>x</b> & y')}</div>`)).toBe('<div><!----><b>x</b> & y</div>');
  });

  it('rejects other objects in development and writes nothing in production', () => {
    expect(() => dev(html`<p>${{ a: 1 }}</p>`)).toThrow(/can't render/);
    expect(prod(html`<p>${{ a: 1 }}</p>`)).toBe('<p></p>');
  });

  it('rejects a Promise anywhere: server renders are synchronous', () => {
    const later = Promise.resolve('x');
    expect(() => prod(html`<p>${later}</p>`)).toThrow(/got a Promise/);
    expect(() => prod(html`<p title=${later}></p>`)).toThrow(/got a Promise/);
    expect(() => prod(html`<textarea>${later}</textarea>`)).toThrow(/got a Promise/);
  });
});

describe('attributes (02 "Attribute values", "Boolean attributes", "Properties")', () => {
  it('escapes & and " in double-quoted values', () => {
    expect(prod(html`<a title=${`"<&>'`}></a>`)).toBe(`<a title="&quot;&lt;&amp;&gt;'"></a>`);
    // `<` and `>` too: no markup appears raw in an attribute (06 "Escaping").
    expect(prod(html`<a title="x ${'<script>'}"></a>`)).toBe(`<a title="x &lt;script&gt;"></a>`);
  });

  it('writes strings, numbers and booleans; leaves null, undefined and nothing out', () => {
    const a = (v: unknown) => prod(html`<a aria-expanded=${v}></a>`);
    expect(a('x')).toBe('<a aria-expanded="x"></a>');
    expect(a(0)).toBe('<a aria-expanded="0"></a>');
    expect(a(true)).toBe('<a aria-expanded="true"></a>');
    expect(a(false)).toBe('<a aria-expanded="false"></a>');
    for (const v of [null, undefined, nothing]) expect(a(v)).toBe('<a></a>');
  });

  it('joins multi-attribute pieces; null pieces are empty, nothing removes it', () => {
    const m = (x: unknown, y: unknown) => prod(html`<a class="btn ${x} ${y}"></a>`);
    expect(m('a', 1)).toBe('<a class="btn a 1"></a>');
    expect(m(null, undefined)).toBe('<a class="btn  "></a>');
    expect(m('a', nothing)).toBe('<a></a>');
  });

  it('writes boolean attributes bare when truthy', () => {
    const b = (v: unknown) => prod(html`<button ?disabled=${v}></button>`);
    expect(b(1)).toBe('<button disabled></button>');
    for (const v of [0, '', false, null, nothing]) expect(b(v)).toBe('<button></button>');
  });

  it('drops property holes on elements that are not Gyral components', () => {
    expect(prod(html`<my-thing .data=${[1]} a="1"></my-thing>`)).toBe(
      '<my-thing a="1"></my-thing>',
    );
    expect(prod(html`<div .data=${[1]}></div>`)).toBe('<div></div>');
  });

  it("writes an element hook's server half, and nothing for hooks without one", () => {
    const tip = defineHook<[string]>({
      server: ([t]) => ({ 'data-tip': t, hidden: true }),
      client: () => undefined,
    });
    const quiet = defineHook<[]>({ client: () => undefined });
    expect(prod(html`<p ${tip('a"b')}></p>`)).toBe('<p data-tip="a&quot;b" hidden></p>');
    expect(prod(html`<p ${quiet()}></p>`)).toBe('<p></p>');
    expect(prod(html`<p ${null}></p>`)).toBe('<p></p>');
    expect(() => dev(html`<p ${'x'}></p>`)).toThrow(/element hook position/);
  });
});

describe('text content and live form state (02 "Live form state")', () => {
  it('escapes textarea and title content, flattened like the client', () => {
    expect(prod(html`<textarea>${'</textarea><b>&'}</textarea>`)).toBe(
      '<textarea>\n&lt;/textarea&gt;&lt;b&gt;&amp;</textarea>',
    );
    expect(prod(html`<title>${7}</title>`)).toBe('<title>7</title>');
    expect(prod(html`<title>${null}</title>`)).toBe('<title></title>');
  });

  it('writes form state as attributes; ?indeterminate has none', () => {
    const form = html`<input value=${'v"'} /><input
        type="checkbox"
        ?checked=${true}
        ?indeterminate=${true}
      /><select>
        <option ?selected=${true}>a</option>
      </select>
      <details ?open=${false}></details>`;
    expect(prod(form)).toBe(
      '<input value="v&quot;"><input type="checkbox" checked>' +
        '<select><option selected>a</option></select><details></details>',
    );
  });
});

describe('development markers and checks (06 "Development markers")', () => {
  it('precede each template instance with its id in development only', () => {
    const inner = (n: number) => html`<b>${n}</b>`;
    const outer = html`<p>${inner(1)}${[inner(2)]}</p>`;
    const id = (t: ReturnType<typeof html>) => templateOf(t).id;
    expect(dev(outer)).toBe(
      `<!--gyral:${id(outer)}--><p><!--gyral:${id(inner(1))}--><b>1</b><!---->` +
        `<!--gyral:${id(inner(1))}--><b>2</b></p>`,
    );
    expect(prod(outer)).toBe('<p><b>1</b><!----><b>2</b></p>');
  });

  it('write no marker before a server template (a page shell is never hydrated)', () => {
    expect(
      dev(
        html`<!doctype html>
          <html>
            <body>
              ${'x'}
            </body>
          </html>`,
      ),
    ).toBe('<!doctype html><html><body>x</body></html>');
  });

  it('write no anchors in a server template; nested templates keep theirs (06)', () => {
    const nested = html`<p>${'a'} b ${raw('<i>r</i>')}</p>`;
    const shell = html`<!doctype html>
      <html>
        <head>
          <title>${'T'}</title>
          ${raw('<style>p {}</style>')} ${raw('<script type="application/json">{}</script>')}
        </head>
        <body>
          ${'z'} text ${nested}
        </body>
      </html>`;
    expect(templateOf(shell).html).not.toContain('<!---->');
    expect(prod(shell)).toBe(
      '<!doctype html><html><head><title>T</title><style>p {}</style>' +
        '<script type="application/json">{}</script></head>' +
        '<body>z text <p>a<!----> b <!----><i>r</i></p></body></html>',
    );
  });

  it('reject text the parser would move out of table structure, in development', () => {
    const rows = (v: unknown) =>
      html`<table>
        <tbody>
          ${v}
        </tbody>
      </table>`;
    expect(() => dev(rows('oops'))).toThrow(/directly inside <tbody>.*foster/s);
    expect(() => dev(rows([html`${'nested root text'}`]))).toThrow(/<tbody>/);
    expect(() => dev(rows(5))).toThrow(/<tbody>/);
    expect(dev(rows(' \n'))).toContain('<tbody> \n</tbody>');
    expect(prod(rows('oops'))).toBe('<table><tbody>oops</tbody></table>');
    expect(
      dev(
        html`<table>
          <tbody>
            <tr>
              <td>${'ok'}</td>
            </tr>
          </tbody>
        </table>`,
      ),
    ).toContain('ok');
  });

  it('refuse a template compiled for the client (no segments)', () => {
    const client = clientObject(normalize(['<p>', '</p>']));
    expect(() => prod(compiled(client, ['x']))).toThrow(/no server segments/);
  });
});
