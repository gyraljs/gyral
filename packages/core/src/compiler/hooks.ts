// The template compiler's build hooks (view/01-templates.md "Compiled",
// view/09-template-rules.md), loaded lazily by the plugin shell in ../vite.ts on the first
// `vite build` hook, so the preset stays loadable from any vite.config.ts:
//   - `transform` (the shell is enforce: 'pre', so positions are the author's own source,
//     TypeScript included, parsed by Rolldown's `this.parse`): rewrites each `html` call site
//     of the configured sources into `compiled(<hoisted template object>, [values…])`,
//     dependencies in node_modules included. Template rule violations, and references it
//     can't follow, fail the build with a code frame.
//   - `generateBundle`: fails when an uncompiled `html` survived in a chunk anyway (re-exports
//     across modules, dynamic imports): the guarantee that the `#prepare` stub is never hit.
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { Node } from './ast.js';
import { CompileError, compileModule } from './compile.js';
import { loadParse5, type Parse5 } from './parse5-check.js';
import { findUses, htmlImports } from './scan.js';
import { Lines } from './source.js';

type Fn<H> = H extends { handler: infer F } ? F : H;
type HookFn<K extends keyof Plugin> = Fn<NonNullable<Plugin[K]>>;

export interface CompilerHooks {
  readonly configResolved: HookFn<'configResolved'>;
  readonly buildStart: HookFn<'buildStart'>;
  readonly transform: HookFn<'transform'>;
  readonly generateBundle: HookFn<'generateBundle'>;
}

export interface CompilerSettings {
  readonly sources: readonly string[];
  /** The module to load parse5 from; undefined skips the parse5 check. */
  readonly parse5: string | undefined;
}

/** Core's own view modules: always sources (core-internal templates, tests). */
const VIEW = ['index', 'template'].flatMap((name) =>
  ['.ts', '.js'].map((ext) => fileURLToPath(new URL(`../view/${name}${ext}`, import.meta.url))),
);
/** template.ts's symbol description: the module defining `html`, in any copy of core. */
const DEFINES_HTML = /Symbol\(['"]gyral\.template['"]\)/;
const SCRIPT = /\.[cm]?[jt]sx?$/;

interface BuildState {
  readonly sourceIds: Set<string>;
  readonly definers: Set<string>;
  readonly seen: Map<string, { readonly strings: string; readonly loc: string }>;
}

const langOf = (id: string): 'js' | 'jsx' | 'ts' | 'tsx' =>
  /\.[cm]?tsx$/.test(id) ? 'tsx' : /\.[cm]?ts$/.test(id) ? 'ts' : id.endsWith('x') ? 'jsx' : 'js';

const CANT_FOLLOW =
  `This use of html can't be compiled: the template compiler rewrites only html\`…\` tagged ` +
  `templates whose tag is the imported html itself (or ns.html for import * as ns). ` +
  `Aliasing it, passing it around or calling it as a function would reach the runtime ` +
  `template preparer, which builds made with the Gyral preset leave out. Write html\`…\` at ` +
  `the call site (view/01-templates.md "Compiled").`;

export function createCompiler(settings: CompilerSettings): CompilerHooks {
  const { sources } = settings;
  /** Per environment (client, ssr, …): Vite may build them with one plugin instance. */
  const states = new WeakMap<object, BuildState>();
  const global = {};
  let root = '';
  let treeshake = true;
  let info: (message: string) => void = () => undefined;
  let parse5: { readonly module: Parse5 | undefined } | undefined;

  function stateOf(env: object | undefined): BuildState {
    const key = env ?? global;
    let state = states.get(key);
    if (state === undefined) {
      state = { sourceIds: new Set(VIEW), definers: new Set(), seen: new Map() };
      states.set(key, state);
    }
    return state;
  }

  /** parse5, loaded once; the notice when it is missing is printed once too. */
  function loadOnce(): Parse5 | undefined {
    const specifier = settings.parse5;
    if (specifier === undefined) return undefined;
    if (parse5 === undefined) {
      parse5 = { module: loadParse5(specifier, root) };
      if (parse5.module === undefined) {
        info(
          `gyral: ${specifier} is not installed, so the template compiler skips its extra ` +
            `rule 7 check (the normalizer's own check still runs). To get it: pnpm add -D ` +
            `parse5 (view/09-template-rules.md).`,
        );
      }
    }
    return parse5.module;
  }

  return {
    configResolved(config) {
      root = config.root;
      treeshake = config.build.rolldownOptions.treeshake !== false;
      info = (message) => {
        config.logger.info(message);
      };
    },

    async buildStart() {
      states.delete(this.environment);
      const state = stateOf(this.environment);
      for (const source of sources) {
        const resolved = await this.resolve(source, join(root, 'index.html'));
        if (resolved !== null) state.sourceIds.add(resolved.id);
      }
      loadOnce();
    },

    async transform(code, id, opts) {
      if (id.startsWith('\0') || !SCRIPT.test(id)) return null;
      const env = this.environment;
      const state = stateOf(env);
      if (DEFINES_HTML.test(code)) state.definers.add(id);
      if (state.sourceIds.has(id)) return null;
      let program: Node;
      try {
        program = this.parse(code, { lang: langOf(id) }) as unknown as Node;
      } catch {
        return null; // not ours to report: the bundler fails on it with a better message
      }
      const { imports, reexports } = htmlImports(program);
      if (imports.length === 0 && reexports.length === 0) return null;
      const isSource = async (specifier: string): Promise<boolean> => {
        if (sources.includes(specifier)) return true;
        const resolved = await this.resolve(specifier, id);
        return resolved !== null && state.sourceIds.has(resolved.id);
      };
      const lines = new Lines(code);
      const file = relative(root, id);
      const where = (node: Node): string => `${file}:${String(lines.position(node.start).line)}`;
      for (const r of reexports) {
        if (!(await isSource(r.specifier))) continue;
        this.warn(
          `${where(r.node)}: re-exporting html. The template compiler only follows html ` +
            `imported straight from ${r.specifier}: templates written with this re-export stay ` +
            `uncompiled and fail the build. Import html from ${r.specifier} instead.`,
        );
      }
      const matched = [];
      for (const binding of imports) if (await isSource(binding.specifier)) matched.push(binding);
      if (matched.length === 0) return null;
      const fail = (start: number, end: number, message: string): never =>
        this.error({
          message,
          id,
          loc: { file: id, ...lines.position(start) },
          frame: lines.frame(start, end),
        });
      const { sites, leftovers } = findUses(program, matched);
      for (const l of leftovers) {
        if (l.exported)
          this.warn(`${where(l.node)}: re-exporting html; its users stay uncompiled.`);
        else fail(l.node.start, l.node.end, CANT_FOLLOW);
      }
      if (sites.length === 0) return null;
      try {
        return compileModule({
          lines,
          id,
          file,
          sites,
          ssr: opts?.ssr === true || env.config.consumer === 'server',
          parse5: loadOnce(),
          seen: state.seen,
        });
      } catch (error) {
        if (error instanceof CompileError) return fail(error.start, error.end, error.message);
        throw error;
      }
    },

    generateBundle(_, bundle) {
      const state = stateOf(this.environment);
      // Without tree-shaking every export is rendered, used or not.
      if (state.definers.size === 0 || !treeshake) return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const [id, module] of Object.entries(chunk.modules)) {
          if (!state.definers.has(id) || !module.renderedExports.includes('html')) continue;
          this.error(
            `gyral: an uncompiled html template remains in ${chunk.fileName}: something uses ` +
              `html from ${relative(root, id)} in a way the template compiler can't see (a ` +
              `re-export, a dynamic import, or a module it doesn't process). With the ` +
              `gyral-compiled condition the runtime preparer is left out, so that template ` +
              `would throw. Import html straight from '@gyral/core' where you write templates ` +
              `(view/01-templates.md "Compiled").`,
          );
        }
      }
    },
  };
}
