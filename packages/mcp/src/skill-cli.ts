// `gyral-mcp skill` (gyral-337.4): writes the Gyral skill this package bundles (the corpus's
// `skill`, built from the release's skills/gyral) into an app's agent folders, so coding agents
// read the guidance for the Gyral version the app runs; `--check` fails when a copy differs, for
// CI. It replaces hand-copied skills pinned by hash: each copy gets a VERSION file naming its
// release and source, and the owner's license, notice, pin and source files beside it stay
// (gyral-337.18). @gyral/mcp's version is always core's, so the app's installed @gyral/core must
// be this release: `npx @gyral/mcp@<version> skill`.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { Corpus } from './types.js';

export interface SkillOptions {
  /** The app's folder (default: the current directory). */
  readonly project: string;
  /** Skill folders to write, absolute or relative to the project; default `.claude/skills/gyral`, and `.agents/skills/gyral` when it exists. */
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

/** A folder as printed: relative to the project when inside it, else in full (gyral-vbm). */
function shown(project: string, root: string): string {
  const path = relative(resolve(project), root);
  const outside = path === '' || /^\.\.(?:[\\/]|$)/.test(path) || isAbsolute(path);
  return outside ? root : path.split('\\').join('/');
}

/**
 * Files an owner keeps at the top of a vendored or user-level copy (gyral-337.18): a license and
 * notice (the skill is MIT-licensed, and a copy carries them), a pin or source note. They are
 * never compared or removed. A file the skill ships is the skill's, whatever its name.
 */
const OWNER = /^(?:LICEN[CS]E|NOTICE|COPYING|PINNED|SOURCES?)(?:[._-][^/]*)?$/i;

/** The VERSION file each copy gets: the release and its source, so no pin note is needed. */
function versionFile(version: string): string {
  return [
    version,
    '',
    `The Gyral ${version} skill, from https://github.com/gyraljs/gyral/tree/v${version}/skills/gyral`,
    `Written by \`npx @gyral/mcp@${version} skill\`; its \`--check\` fails when this folder differs.`,
    '',
  ].join('\n');
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
  const want = new Map(corpus.skill.map((f) => [f.path, f.content]));
  want.set('VERSION', versionFile(corpus.version));
  const skill = `the Gyral ${corpus.version} skill`;
  const lines: string[] = [];
  let ok = true;
  for (const folder of skillDirs(options)) {
    const root = resolve(options.project, folder);
    const dir = shown(options.project, root);
    const changed = [...want].filter(([path, text]) => {
      const file = join(root, path);
      return !existsSync(file) || readFileSync(file, 'utf8') !== text;
    });
    const others = filesIn(root).filter((path) => !want.has(path));
    const kept = others.filter((path) => OWNER.test(path)).sort();
    const extra = others.filter((path) => !OWNER.test(path));
    const keeps = kept.length === 0 ? '' : `kept ${kept.join(', ')}`;
    if (options.check) {
      const problems = [
        ...changed.map(([p]) => `${dir}/${p} differs`),
        ...extra.map((p) => `${dir}/${p} is not in the skill`),
      ];
      if (problems.length > 0) ok = false;
      const done = `${dir}: ${skill}${keeps === '' ? '' : ` (${keeps})`}`;
      lines.push(problems.length === 0 ? done : problems.join('\n'));
      continue;
    }
    for (const [path, text] of changed) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    for (const path of extra) rmSync(join(root, path));
    const counts = `${String(changed.length)} written, ${String(extra.length)} removed`;
    lines.push(`${dir}: ${skill} (${counts}${keeps === '' ? '' : `; ${keeps}`})`);
  }
  if (!ok) lines.push(`Run \`${update}\` to update.`);
  return { ok, lines };
}
