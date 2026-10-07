// Development source locations for runtime templates (view/01-templates.md "Source locations",
// gyral-g1r.24). `vite serve` (the dev server and Vitest) doesn't compile templates, and stack
// traces point into Vite's transformed modules, whose lines aren't the author's. So the preset's
// `gyral:template-locations` plugin (serve only, enforce: 'pre', loaded lazily like the
// compiler) rewrites each html`…` call site of the configured sources into
//   (html.at?.("src/app.ts:12:5") ?? html)`…`
// (svg`…` call sites the same way, with svg.at) and the development runtime records that
// position for the template (view/loc.ts). Nothing else changes and no line moves. Uses the
// compiler can't follow (an aliased html) stay as they are: the runtime falls back to the stack
// trace there.
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { nodeAt, type Node } from './ast.js';
import { findUses, htmlImports } from './scan.js';
import { Lines, splice, type Edit } from './source.js';

type Fn<H> = H extends { handler: infer F } ? F : H;
type HookFn<K extends keyof Plugin> = Fn<NonNullable<Plugin[K]>>;

export interface LocatorHooks {
  readonly configResolved: HookFn<'configResolved'>;
  readonly transform: HookFn<'transform'>;
}

/** Core's own view modules: always sources (core-internal templates, tests). */
export const VIEW = ['index', 'template'].flatMap((name) =>
  ['.ts', '.js'].map((ext) => fileURLToPath(new URL(`../view/${name}${ext}`, import.meta.url))),
);

const SCRIPT = /\.[cm]?[jt]sx?$/;

const langOf = (id: string): 'js' | 'jsx' | 'ts' | 'tsx' =>
  /\.[cm]?tsx$/.test(id) ? 'tsx' : /\.[cm]?ts$/.test(id) ? 'ts' : id.endsWith('x') ? 'jsx' : 'js';

/** `sources`: as the compiler's (module specifiers whose `html` and `svg` are the view layer's tags). */
export function createLocator(sources: readonly string[]): LocatorHooks {
  let root = '';
  /** Resolved ids of the sources, per environment (resolution may differ between them). */
  const resolved = new WeakMap<object, Promise<Set<string>>>();

  return {
    configResolved(config) {
      root = config.root;
    },

    async transform(code, id) {
      if (id.startsWith('\0') || !SCRIPT.test(id) || id.includes('/node_modules/')) return null;
      let program: Node;
      try {
        program = this.parse(code, { lang: langOf(id) }) as unknown as Node;
      } catch {
        return null; // not ours to report
      }
      const { imports } = htmlImports(program);
      if (imports.length === 0) return null;
      let ids = resolved.get(this.environment);
      if (ids === undefined) {
        ids = Promise.all(sources.map((s) => this.resolve(s, id))).then(
          (rs) => new Set([...VIEW, ...rs.flatMap((r) => (r === null ? [] : [r.id]))]),
        );
        resolved.set(this.environment, ids);
      }
      const sourceIds = await ids;
      const matched = [];
      for (const binding of imports) {
        const r = sources.includes(binding.specifier)
          ? null
          : await this.resolve(binding.specifier, id);
        if (sources.includes(binding.specifier) || (r !== null && sourceIds.has(r.id))) {
          matched.push(binding);
        }
      }
      if (matched.length === 0) return null;
      const { sites } = findUses(program, matched);
      if (sites.length === 0) return null;
      const lines = new Lines(code);
      const file = relative(root, id);
      const edits: Edit[] = [];
      for (const { node } of sites) {
        const tag = nodeAt(node, 'tag');
        if (tag === undefined) continue;
        const { line, column } = lines.position(node.start);
        const loc = JSON.stringify(`${file}:${String(line)}:${String(column + 1)}`);
        const name = code.slice(tag.start, tag.end);
        edits.push({ start: tag.start, end: tag.start, text: '(' });
        edits.push({ start: tag.end, end: tag.end, text: `.at?.(${loc}) ?? ${name})` });
      }
      return splice(lines, edits, id);
    },
  };
}
