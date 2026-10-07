// view/01-templates.md "Template results" and "Two ways to get a template object": results are
// recognised by a module-private symbol, runtime results are normalized once per call site
// through `#prepare`, compiled results carry their template object, and the compiled-build stub
// fails loudly.
import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/view/normalize/normalize.js';
import { prepare as stubPrepare, verify as stubVerify } from '../../src/view/prepare-stub.js';
import { compiled, html, isTemplateResult, templateOf } from '../../src/view/template.js';
import { readable } from './helpers.js';

const view = (n: number) => html`<p class="n-${n}">${n}</p>`;

describe('template results (view/01)', () => {
  it('carry the values without copying or work', () => {
    const values = [1, 'a'];
    const result = html`<b title=${values[0]}>${values[1]}</b>`;
    expect(result.values).toEqual(values);
    expect(isTemplateResult(result)).toBe(true);
  });

  it('cannot be forged from JSON or plain objects', () => {
    const parsed: unknown = JSON.parse(JSON.stringify(view(1)));
    expect(isTemplateResult(parsed)).toBe(false);
    expect(isTemplateResult({ values: [] })).toBe(false);
    expect(isTemplateResult(null)).toBe(false);
    expect(isTemplateResult('<p></p>')).toBe(false);
  });

  it('normalize once per call site (cached by the strings array)', () => {
    const a = templateOf(view(1));
    expect(templateOf(view(2))).toBe(a);
    expect(a.html).toBe('<p></p>');
    expect(a.parts.map(readable)).toEqual([
      { k: 'attr', path: [0], name: 'class', strings: ['n-', ''] },
      { k: 'child', path: [0], ref: null, sole: true },
    ]);
  });

  it('give the same id at runtime as the normalizer (and so the compiler)', () => {
    const strings = ['<p class="n-', '">', '</p>'];
    expect(templateOf(view(1)).id).toBe(normalize(strings).id);
  });

  it('pass a compiled template object through', () => {
    const object = normalize(['<i>', '</i>']);
    const result = compiled(object, ['x']);
    expect(isTemplateResult(result)).toBe(true);
    expect(templateOf(result)).toBe(object);
    expect(result.values).toEqual(['x']);
  });

  it('throw the template rules on first use', () => {
    // eslint-disable-next-line gyral/template -- breaks rule 1 on purpose: the runtime must throw
    expect(() => templateOf(html`<button @click=${() => 1}></button>`)).toThrow(/rule 1/);
  });
});

describe('the gyral-compiled stub of #prepare', () => {
  it('fails with what was not compiled and how to fix it', () => {
    expect(() => stubPrepare(['<p class="a">', '</p>'])).toThrow(
      /not compiled: `<p class="a">\$\{…\}<\/p>`.*gyral-compiled.*Vite preset/s,
    );
  });

  it('has nothing to verify', () => {
    expect(() => {
      stubVerify(normalize(['<p></p>']), {} as HTMLTemplateElement);
    }).not.toThrow();
  });
});

describe('the #prepare import map (ADR 0017 pattern)', () => {
  it('resolves to the preparer by default and to the stub under gyral-compiled', async () => {
    const { default: manifest } = (await import('../../package.json', {
      with: { type: 'json' },
    })) as unknown as {
      default: {
        imports: Record<string, unknown>;
        publishConfig: { imports: Record<string, unknown> };
      };
    };
    expect(manifest.imports['#prepare']).toEqual({
      'gyral-compiled': './src/view/prepare-stub.ts',
      default: './src/view/prepare.ts',
    });
    expect(manifest.publishConfig.imports['#prepare']).toEqual({
      'gyral-compiled': './dist/view/prepare-stub.js',
      default: './dist/view/prepare.js',
    });
  });
});
