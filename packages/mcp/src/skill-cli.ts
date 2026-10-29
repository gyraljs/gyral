// `gyral-mcp skill` (gyral-337.4): writes the Gyral skill this package bundles (the corpus's
// `skill`, built from the release's skills/gyral) into an app's agent folders, so coding agents
// read the guidance for the Gyral version the app runs; `--check` fails when a copy differs, for
// CI. It replaces hand-copied skills pinned by hash. @gyral/mcp's version is always core's, so
// the app's installed @gyral/core must be this release: `npx @gyral/mcp@<version> skill`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { Corpus } from './types.js';

export interface SkillOptions {
  /** The app's folder (default: the current directory). */
  readonly project: string;
  /** Skill folders to write, relative to the project; default `.claude/skills/gyral`, and `.agents/skills/gyral` when it exists. */
  readonly dirs: readonly string[];
  readonly check: boolean;
}

export interface SkillResult {
  readonly ok: boolean;
  readonly lines: readonly string[];
}

/** The version of @gyral/core installed for `project` (Node's lookup), if any. */
export function installedCore(project: string): string | undefined {
  for (let dir = resolve(project); ; dir = dirname(dir)) {
    try {
      const file = join(dir, 'node_modules', '@gyral', 'core', 'package.json');
      const { version } = JSON.parse(readFileSync(file, 'utf8')) as { version?: unknown };
      return typeof version === 'string' ? version : undefined;
    } catch {
      if (dirname(dir) === dir) return undefined;
    }
  }
}

/** Every file under `dir`, as paths relative to it. */
function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split('\\').join('/'));
}

const DEFAULT = '.claude/skills/gyral';
const AGENTS = '.agents/skills/gyral';

/** The skill folders to keep for `options`. */
export function skillDirs(options: SkillOptions): string[] {
  if (options.dirs.length > 0) return [...options.dirs];
  return existsSync(join(options.project, AGENTS)) ? [DEFAULT, AGENTS] : [DEFAULT];
}

/** Writes (or with `check`, compares) the skill in each folder. */
export function syncSkill(corpus: Corpus, options: SkillOptions): SkillResult {
  const installed = installedCore(options.project);
  const update = `npx @gyral/mcp@${installed ?? corpus.version} skill`;
  if (installed !== corpus.version) {
    const what =
      installed === undefined
        ? 'no @gyral/core is installed'
        : `@gyral/core ${installed} is installed`;
    return {
      ok: false,
      lines: [
        `${what} in ${options.project}, but this is the skill of Gyral ${corpus.version}. Run \`${update}\`.`,
      ],
    };
  }
  const lines: string[] = [];
  let ok = true;
  for (const dir of skillDirs(options)) {
    const root = join(options.project, dir);
    const want = new Map(corpus.skill.map((f) => [f.path, f.content]));
    const have = filesIn(root);
    const changed = [...want].filter(([path, text]) => {
      const file = join(root, path);
      return !existsSync(file) || readFileSync(file, 'utf8') !== text;
    });
    const extra = have.filter((path) => !want.has(path));
    if (options.check) {
      const problems = [
        ...changed.map(([p]) => `${dir}/${p} differs`),
        ...extra.map((p) => `${dir}/${p} is not in the skill`),
      ];
      if (problems.length > 0) ok = false;
      lines.push(
        problems.length === 0 ? `${dir}: the Gyral ${corpus.version} skill` : problems.join('\n'),
      );
      continue;
    }
    for (const [path, text] of changed) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    for (const path of extra) rmSync(join(root, path));
    lines.push(
      `${dir}: the Gyral ${corpus.version} skill (${String(changed.length)} written, ${String(extra.length)} removed)`,
    );
  }
  if (!ok) lines.push(`Run \`${update}\` to update.`);
  return { ok, lines };
}
