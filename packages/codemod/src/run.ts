/// <reference types="node" />
// A whole run: check the working tree, read every module under the paths, transform it, keep it
// formatted with the app's Prettier, then write it (or diff it, with `dry`). A module whose
// package has an older @gyral/core than the release is left, and reported (./core-version.ts).
import { readFile, writeFile } from 'node:fs/promises';
import { createTwoFilesPatch, FILE_HEADERS_ONLY } from 'diff';
import { coreVersions, olderThan, type CoreVersion } from './core-version.js';
import { collectFiles, displayPath } from './files.js';
import { keepFormatted, loadPrettier, type Prettier } from './format.js';
import { workingTreeProblem } from './git.js';
import { transformSource, type FileResult, type Finding } from './transform.js';
import { RELEASES } from './transforms/index.js';

/** The releases this codemod has transforms for. */
export const releases: readonly string[] = Object.keys(RELEASES);

export interface CodemodOptions {
  /** The release to migrate to, e.g. `'0.3.8'`. */
  readonly release: string;
  /** Files and directories to rewrite, relative to `cwd`. Default `['.']`. */
  readonly paths?: readonly string[];
  /** Where relative paths start; findings and diffs name files relative to it. Default: the process's. */
  readonly cwd?: string;
  /** Write nothing; `diff` holds a unified diff of what would change. Skips the working-tree check. */
  readonly dry?: boolean;
  /** Write even with uncommitted changes, or outside a git repository. */
  readonly force?: boolean;
}

export type CodemodResult =
  | { readonly ok: false; readonly error: string }
  | {
      readonly ok: true;
      /** How many modules it read. */
      readonly files: number;
      /** The modules it changed (or would change, with `dry`), relative to `cwd`. */
      readonly changed: readonly string[];
      /**
       * The changed modules left as the codemod wrote them, not formatted with the app's
       * Prettier: the app has none, or they didn't pass it before the rewrite.
       */
      readonly unformatted: readonly string[];
      /** Every candidate left as is, by file and line. */
      readonly findings: readonly Finding[];
      /** With `dry`: the unified diff of every change. Empty otherwise. */
      readonly diff: string;
    };

/** A git-style unified diff of one file's change. */
export function unifiedDiff(file: string, before: string, after: string): string {
  return createTwoFilesPatch(`a/${file}`, `b/${file}`, before, after, undefined, undefined, {
    context: 3,
    headerOptions: FILE_HEADERS_ONLY,
  });
}

function safely(release: string, code: string, file: string): FileResult {
  try {
    return transformSource(release, code, file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `left as is: the codemod failed on it (${message}); please report this`;
    return {
      file,
      before: code,
      after: code,
      findings: [{ file, line: 0, transform: 'error', reason }],
    };
  }
}

/** The finding for a module whose package's @gyral/core is older than `release`. */
function tooOld(file: string, core: CoreVersion, release: string, cwd: string): Finding {
  const manifest = displayPath(core.manifest, cwd);
  const where = core.installed
    ? `installed for ${manifest}`
    : `declared in ${manifest}, not installed`;
  const reason =
    `left as is: this package's @gyral/core is ${core.version} (${where}), and the ${release} ` +
    `rewrites need ${release}. Upgrade it, then run the codemod again`;
  return { file, line: 0, transform: 'core-version', reason };
}

/** Runs a release's transforms over every module under `paths`. */
export async function runCodemod(options: CodemodOptions): Promise<CodemodResult> {
  const { release, paths = ['.'], cwd = process.cwd(), dry = false, force = false } = options;
  if (RELEASES[release] === undefined) {
    return {
      ok: false,
      error: `no transforms for release "${release}" (known: ${releases.join(', ')})`,
    };
  }
  if (!dry && !force) {
    const problem = workingTreeProblem(paths, cwd);
    if (problem !== undefined) {
      const error = `refusing to write: ${problem}. Pass --force to write anyway, or --dry to see the diff.`;
      return { ok: false, error };
    }
  }
  let files: string[];
  try {
    files = await collectFiles(paths, cwd);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  const changed: string[] = [];
  const unformatted: string[] = [];
  const findings: Finding[] = [];
  let diff = '';
  let prettier: Promise<Prettier | undefined> | undefined;
  const coreOf = coreVersions();
  for (const absolute of files) {
    const file = displayPath(absolute, cwd);
    const result = safely(release, await readFile(absolute, 'utf8'), file);
    const core = coreOf(absolute);
    if (core !== undefined && olderThan(core, release)) {
      const candidates = result.after !== result.before || result.findings.length > 0;
      if (candidates) findings.push(tooOld(file, core, release, cwd));
      continue;
    }
    findings.push(...result.findings);
    if (result.after === result.before) continue;
    prettier ??= loadPrettier(cwd);
    const formatted = await keepFormatted(await prettier, absolute, result.before, result.after);
    if (formatted === undefined) unformatted.push(file);
    const after = formatted ?? result.after;
    changed.push(file);
    if (dry) diff += unifiedDiff(file, result.before, after);
    else await writeFile(absolute, after);
  }
  return { ok: true, files: files.length, changed, unformatted, findings, diff };
}
