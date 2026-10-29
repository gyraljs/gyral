/// <reference types="node" />
// The dirty-tree check: the codemod writes only into a clean git working tree, so `git diff`
// shows exactly what it changed and `git checkout .` undoes it.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MAX_LISTED = 10;

function git(args: readonly string[], cwd: string): { ok: boolean; out: string } {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: result.status === 0 && result.error === undefined, out: result.stdout };
}

/**
 * Why the codemod must not write under `paths` (resolved against `cwd`): a path outside a git
 * repository, or a repository with uncommitted changes (untracked files included). Undefined
 * when every path is in a clean working tree.
 */
export function workingTreeProblem(paths: readonly string[], cwd: string): string | undefined {
  const roots = new Set<string>();
  for (const path of paths) {
    const absolute = resolve(cwd, path);
    const dir =
      existsSync(absolute) && statSync(absolute).isDirectory() ? absolute : dirname(absolute);
    const top = git(['rev-parse', '--show-toplevel'], dir);
    if (!top.ok) {
      return `${path} is not in a git repository, where its changes could be reviewed and undone`;
    }
    roots.add(top.out.trim());
  }
  for (const root of roots) {
    const status = git(['status', '--porcelain'], root);
    if (!status.ok) return `\`git status\` failed in ${root}`;
    const lines = status.out.split('\n').filter((line) => line.trim() !== '');
    if (lines.length > 0) {
      const listed = lines.slice(0, MAX_LISTED).map((line) => `  ${line}`);
      if (lines.length > MAX_LISTED)
        listed.push(`  … and ${String(lines.length - MAX_LISTED)} more`);
      return `${root} has uncommitted changes:\n${listed.join('\n')}\nCommit or stash them first, so \`git diff\` shows only the codemod's changes`;
    }
  }
  return undefined;
}
