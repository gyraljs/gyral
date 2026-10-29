/// <reference types="node" />
// Which files a run reads: every module under the given paths, minus dependencies, build
// output and dot folders.
import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/** Extensions read when walking a directory. */
export const EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];
/** Directory names never entered (dot folders are skipped too). */
export const SKIPPED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
]);

const isModule = (name: string): boolean =>
  EXTENSIONS.some((ext) => name.endsWith(ext)) && !/\.d\.[mc]?ts$/.test(name);

async function walkDir(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) await walkDir(path, out);
    } else if (entry.isFile() && isModule(entry.name)) out.push(path);
  }
}

/**
 * Absolute paths of the modules under `paths` (resolved against `cwd`), sorted. A path that is
 * a file is read if it has a module extension. Throws for a path that doesn't exist.
 */
export async function collectFiles(paths: readonly string[], cwd: string): Promise<string[]> {
  const out: string[] = [];
  for (const path of paths) {
    const absolute = resolve(cwd, path);
    const info = await stat(absolute).catch(() => undefined);
    if (info === undefined) throw new Error(`no such file or directory: ${path}`);
    if (info.isDirectory()) await walkDir(absolute, out);
    else if (isModule(absolute)) out.push(absolute);
  }
  return [...new Set(out)].sort();
}

/** `file` relative to `cwd`, with `/` separators. */
export function displayPath(file: string, cwd: string): string {
  const shown = relative(cwd, file) || file;
  return sep === '/' ? shown : shown.split(sep).join('/');
}
