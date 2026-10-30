/// <reference types="node" />
// Command-line arguments: `gyral-codemod <release> [paths…] [--dry] [--force]`.
import { parseArgs } from 'node:util';
import { EXTENSIONS, SKIPPED_DIRS } from './files.js';
import { RELEASES } from './transforms/index.js';

export interface Options {
  readonly release: string | undefined;
  readonly paths: readonly string[];
  readonly dry: boolean;
  readonly force: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

export type Parsed =
  { readonly ok: true; readonly options: Options } | { readonly ok: false; readonly error: string };

const list = (items: readonly string[]): string =>
  `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;

export function usage(): string {
  const releases = Object.entries(RELEASES).flatMap(([release, transforms]) =>
    transforms.map((t, i) => `  ${(i === 0 ? release : '').padEnd(7)}${t.summary}`),
  );
  return `Usage: npx @gyral/codemod <release> [paths…] [options]

Rewrites a Gyral app's source for a release's API changes wherever the rewrite is provably
safe, and lists every candidate it leaves as is, with file:line and the reason.

Releases:
${releases.join('\n')}

Paths default to the current directory: every ${list(EXTENSIONS)} file under
them, outside ${list([...SKIPPED_DIRS, 'dot folders'])}.

Options:
  --dry          print a unified diff and write nothing
  --force        write even with uncommitted changes, or outside a git repository
  -h, --help     show this help
  -v, --version  show the version

Upgrade and install the release's @gyral/* packages first: it leaves a module whose package
has an older @gyral/core. It writes only into a clean git working tree, so \`git diff\` shows
what it changed. Running it again changes nothing.`;
}

export function parse(argv: readonly string[]): Parsed {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        dry: { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    }));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const [release, ...paths] = positionals;
  const { dry, force, help, version } = values;
  if (!help && !version) {
    const known = Object.keys(RELEASES);
    if (release === undefined) return { ok: false, error: `name a release: ${known.join(', ')}` };
    if (!known.includes(release)) {
      return {
        ok: false,
        error: `no transforms for release "${release}" (known: ${known.join(', ')})`,
      };
    }
  }
  return {
    ok: true,
    options: { release, paths: paths.length > 0 ? paths : ['.'], dry, force, help, version },
  };
}
