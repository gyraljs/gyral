/// <reference types="node" />
// Keeps a Prettier-formatted app formatted (gyral-337.16): a rewrite can leave a line longer, or
// a call on one line, where the app's Prettier would wrap it, and a `format:check` gate then
// fails. So a changed module that passed the app's own Prettier before the rewrite is formatted
// with it after, under the app's config; only the rewritten code moves. Without a Prettier in the
// app, or for a module that didn't pass it, the rewrite stays as written and the report says so.
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PrettierOptions {
  readonly filepath: string;
  readonly [option: string]: unknown;
}

/** The part of Prettier's API (2 or 3) the codemod uses; 3 returns promises. */
export interface Prettier {
  readonly check: (source: string, options: PrettierOptions) => boolean | Promise<boolean>;
  readonly format: (source: string, options: PrettierOptions) => string | Promise<string>;
  readonly resolveConfig: (
    file: string,
    options: { readonly editorconfig: boolean },
  ) => Promise<Readonly<Record<string, unknown>> | null>;
}

const isPrettier = (value: unknown): value is Prettier =>
  typeof value === 'object' &&
  value !== null &&
  ['check', 'format', 'resolveConfig'].every(
    (key) => typeof (value as Readonly<Record<string, unknown>>)[key] === 'function',
  );

/** The Prettier the app at `cwd` resolves (a dependency of its own), if any. */
export async function loadPrettier(cwd: string): Promise<Prettier | undefined> {
  try {
    const path = createRequire(join(resolve(cwd), 'package.json')).resolve('prettier');
    const loaded: unknown = await import(pathToFileURL(path).href);
    if (isPrettier(loaded)) return loaded;
    const api = typeof loaded === 'object' && loaded !== null && 'default' in loaded;
    return api && isPrettier(loaded.default) ? loaded.default : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `after` formatted with the app's Prettier, when `before` passed it (with the config and
 * `.editorconfig` its CLI reads for `file`); `undefined` when the codemod can't vouch for the
 * formatting: no Prettier, a module that wasn't formatted, or Prettier failed on it.
 */
export async function keepFormatted(
  prettier: Prettier | undefined,
  file: string,
  before: string,
  after: string,
): Promise<string | undefined> {
  if (prettier === undefined) return undefined;
  try {
    const config = await prettier.resolveConfig(file, { editorconfig: true });
    const options: PrettierOptions = { ...config, filepath: file };
    if (!(await prettier.check(before, options))) return undefined;
    return await prettier.format(after, options);
  } catch {
    return undefined;
  }
}
