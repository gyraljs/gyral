// The template compiler's scanner (src/compiler/scan.ts): which references to an imported
// `html` are call sites, which are leftovers, and which are other bindings that shadow it.
import { parseSync } from 'vite';
import { describe, expect, it } from 'vitest';
import type { Node } from '../../src/compiler/ast.js';
import { findUses, htmlImports } from '../../src/compiler/scan.js';
import { Lines, splice } from '../../src/compiler/source.js';

const scan = (code: string): { sites: string[]; leftovers: string[]; reexports: string[] } => {
  const program = parseSync('module.ts', code).program as unknown as Node;
  const { imports, reexports } = htmlImports(program);
  const { sites, leftovers } = findUses(program, imports);
  const text = (n: Node): string => code.slice(n.start, n.end);
  return {
    sites: sites.map((s) => text(s.node)),
    leftovers: leftovers.map((l) => text(l.node)),
    reexports: reexports.map((r) => r.specifier),
  };
};

describe('scan', () => {
  it('finds tagged templates of named, renamed and namespace imports', () => {
    const r = scan(`
      import { html } from 'a';
      import { html as h } from 'b';
      import * as ns from 'c';
      export const x = [html\`<p>1</p>\`, h<number>\`<p>2</p>\`, ns.html\`<p>3</p>\`, ns.other];`);
    expect(r.sites).toEqual(['html`<p>1</p>`', 'h<number>`<p>2</p>`', 'ns.html`<p>3</p>`']);
    expect(r.leftovers).toEqual([]);
  });

  it('finds nested templates inside values', () => {
    const r = scan(
      "import { html } from 'a';\nhtml`<ul>${[1].map((n) => html`<li>${n}</li>`)}</ul>`;",
    );
    expect(r.sites).toHaveLength(2);
  });

  it('ignores shadowing bindings, type positions, properties and type-only imports', () => {
    const r = scan(`
      import { html } from 'a';
      import type { html as T } from 'b';
      function f(html: string) { return html.length; }
      const g = () => { const { html } = { html: 1 }; return html; };
      try { } catch (html) { void html; }
      for (const html of []) void html;
      class C { html = 1; html2() { return this.html; } }
      type X = typeof html;
      const o = { html: 1 }; o.html;
      export const y = html\`<p></p>\`;`);
    expect(r.sites).toEqual(['html`<p></p>`']);
    expect(r.leftovers).toEqual([]);
  });

  it('reports uses it cannot follow and re-exports', () => {
    const r = scan(`
      import { html } from 'a';
      import * as ns from 'c';
      const h = html;
      html(['x']);
      const { html: k } = ns;
      ns['html'];
      export { html };
      export { html as tag } from 'd';`);
    expect(r.leftovers).toEqual(['html', 'html', 'ns', "ns['html']", 'html']);
    expect(r.reexports).toEqual(['d']);
  });
});

describe('splice', () => {
  it('applies edits and maps every output line back', () => {
    const code = 'a\nhtml`x\ny`;\nb';
    const lines = new Lines(code);
    const { code: out, map } = splice(
      lines,
      [
        { start: 0, end: 0, text: 'P;' },
        { start: 2, end: 11, text: 'c(t, [\n])' },
      ],
      'm.ts',
    );
    expect(out).toBe('P;a\nc(t, [\n]);\nb');
    expect(map.mappings.split(';')).toHaveLength(out.split('\n').length);
    expect(lines.position(code.indexOf('b'))).toEqual({ line: 4, column: 0 });
  });
});
