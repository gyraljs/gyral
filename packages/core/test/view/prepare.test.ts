// view/01-templates.md "Runtime" and view/09-template-rules.md "How rule 7 is checked", in
// Chromium: the browser's own parse of every template's HTML has exactly the nodes the
// normalizer's paths assume (generated templates and the examples' corpus); markup the parser
// repairs throws rule 7; server templates never reach a <template> (rule 11).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TemplateError } from '../../src/view/normalize/errors.js';
import { templateId } from '../../src/view/normalize/id.js';
import { prepare, verify } from '../../src/view/prepare.js';
import { templateElement } from '../../src/view/template-element.js';
import { html, templateOf } from '../../src/view/template.js';
import { template } from './arbitrary.js';
import { corpus } from './corpus.js';
import { t } from './helpers.js';

function ruleOf(run: () => unknown): number | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof TemplateError) return error.rule;
    throw error;
  }
  return undefined;
}

describe('the runtime preparer in the browser (view/01)', () => {
  it('parses each template once and checks its paths', () => {
    const object = templateOf(
      html`<ul>
        <li class=${'a'}>${1}</li>
        <li>x ${2} y</li>
      </ul>`,
    );
    const el = templateElement(object);
    expect(templateElement(object)).toBe(el);
    expect(el.innerHTML).toBe('<ul><li></li><li>x <!----> y</li></ul>');
  });

  it('matches the browser for generated templates', () => {
    fc.assert(
      fc.property(template, (strings) => {
        expect(() => templateElement(prepare(strings))).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('matches the browser for templates whose root is table structure', () => {
    for (const strings of [
      t`<tr><td>${1}</td><td>${2}</td></tr>`,
      t`<td>${1}</td><td class=${2}></td>`,
      t`<tbody>${1}</tbody><tfoot><tr><td></td></tr></tfoot>`,
      t`<colgroup><col span="2"></colgroup><tbody></tbody>`,
      t`<caption>${1}</caption><thead><tr><th>a</th></tr></thead>`,
    ]) {
      expect(() => templateElement(prepare(strings))).not.toThrow();
    }
  });

  it('matches the browser for every template in the examples', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const { file, strings } of corpus) {
      const rule = ruleOf(() => {
        const object = prepare(strings);
        if (object.server) return;
        templateElement(object);
        checked++;
      });
      if (rule !== undefined) {
        failures.push(`${file}: rule ${String(rule)}: ${strings.join('${…}').slice(0, 100)}`);
      }
    }
    expect(failures).toEqual([]);
    // 244 templates on 2026-10-06.
    expect(checked).toBeGreaterThan(200);
  });

  it('computes the same ids as Node (pinned values)', () => {
    expect(templateId([''])).toBe('1zcjtrv9c6z');
    expect(templateId(['<p>Hello ', '!</p>'])).toBe('xdzcxyuehv');
  });
});

describe('rule 7 by the browser’s parse (view/09)', () => {
  it('throws when the parser builds a different DOM than the normalizer expects', () => {
    const object = prepare(t`<p>${1}</p>`);
    const el = document.createElement('template');
    el.innerHTML = '<div></div>';
    expect(() => {
      verify(object, el);
    }).toThrow(/rule 7.*at path \[0\]: expected <p>, found <div>/s);
  });

  it('catches repairs the structural checks don’t model', () => {
    // <image> becomes <img>; nested <nobr> runs the adoption agency algorithm.
    for (const strings of [
      t`<image src="a.png">${1}</image>`,
      t`<nobr>a<nobr>${1}</nobr></nobr>`,
    ]) {
      expect(ruleOf(() => templateElement(prepare(strings)))).toBe(7);
    }
  });
});

describe('rule 11: server templates in the browser (view/09)', () => {
  it('throws instead of parsing a page shell', () => {
    const shell = templateOf(
      html`<!doctype html>
        <html>
          <body>
            ${1}
          </body>
        </html>`,
    );
    expect(shell.server).toBe(true);
    expect(() => templateElement(shell)).toThrow(TemplateError);
    expect(() => templateElement(shell)).toThrow(/rule 11.*@gyral\/core\/server/s);
  });
});
