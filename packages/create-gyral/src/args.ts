/// <reference types="node" />
// Command-line arguments: `create-gyral [dir] [--template basic|ssr] [--yes]`.
import { parseArgs } from 'node:util';

export const TEMPLATES = ['basic', 'ssr'] as const;
export type Template = (typeof TEMPLATES)[number];

export interface Options {
  /** Target directory, as typed. Undefined: ask (or use the default with --yes). */
  readonly dir: string | undefined;
  /** Undefined: ask (or use `basic` with --yes). */
  readonly template: Template | undefined;
  /** Accept defaults for everything not given; never prompt. */
  readonly yes: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export type Parsed =
  { readonly ok: true; readonly options: Options } | { readonly ok: false; readonly error: string };

export const isTemplate = (value: string): value is Template =>
  (TEMPLATES as readonly string[]).includes(value);

export const USAGE = `Usage: npm create gyral@latest [dir] -- [options]

Options:
  -t, --template <name>  ${TEMPLATES.join(' | ')} (default: basic)
  -y, --yes              use defaults, don't ask
  -h, --help             show this help
  -v, --version          show the version

Templates:
  basic  Vite + a counter component + a Vitest browser test
  ssr    pages prerendered with @gyral/ssr and hydrated in place, plus a production server`;

export function parse(argv: readonly string[]): Parsed {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        template: { type: 'string', short: 't' },
        yes: { type: 'boolean', short: 'y', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    }));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (positionals.length > 1) {
    return { ok: false, error: `expected one directory, got ${positionals.join(' ')}` };
  }
  const template = values.template;
  if (template !== undefined && !isTemplate(template)) {
    return {
      ok: false,
      error: `unknown template "${template}" (choose ${TEMPLATES.join(' or ')})`,
    };
  }
  return {
    ok: true,
    options: {
      dir: positionals[0],
      template,
      yes: values.yes,
      help: values.help,
      version: values.version,
    },
  };
}
