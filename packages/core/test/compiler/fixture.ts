// Builds small fixture apps with the real `vite build` (programmatic API, write: false) and the
// Gyral preset, for the template compiler's tests. Each app lives in its own temp directory.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, type Rolldown } from 'vite';
import { gyralVitePreset, type TemplateCompilerOptions } from '../../src/vite.js';

/** Core's internal view module: the fixtures import `html` from it by absolute path. */
export const VIEW = resolve(import.meta.dirname, '../../src/view/index.ts');

export interface Built {
  /** All chunks' code, concatenated. */
  readonly code: string;
  readonly logs: readonly string[];
}

export interface BuildOptions {
  readonly ssr?: boolean;
  /**
   * A production build (NODE_ENV=production while it runs): Vite resolves the `production`
   * condition. Otherwise Vitest's NODE_ENV=test makes it a development build.
   */
  readonly production?: boolean;
  /** The client's resolve conditions, when the app names its own. */
  readonly conditions?: readonly string[];
  readonly compiler?: TemplateCompilerOptions;
  readonly entry?: string;
}

/** Writes `files` (paths relative to the app root) into a fresh temp dir. */
export function app(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'gyral-compiler-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

export async function buildApp(
  files: Readonly<Record<string, string>>,
  options: BuildOptions = {},
): Promise<Built> {
  const root = app(files);
  const logs: string[] = [];
  const log = (msg: string): void => {
    logs.push(msg);
  };
  const entry = join(root, options.entry ?? 'main.ts');
  const preset = gyralVitePreset(
    options.compiler === undefined ? {} : { compiler: options.compiler },
  );
  const nodeEnv = process.env['NODE_ENV'];
  if (options.production === true) process.env['NODE_ENV'] = 'production';
  try {
    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent', // the custom logger still receives everything
      customLogger: {
        info: log,
        warn: log,
        warnOnce: log,
        error: log,
        clearScreen: () => undefined,
        hasErrorLogged: () => false,
        hasWarned: false,
      },
      ...preset,
      ...(options.conditions === undefined
        ? {}
        : { resolve: { conditions: [...options.conditions] } }),
      build: {
        write: false,
        minify: false,
        ...(options.ssr === true ? { ssr: entry } : {}),
        // Keep the entry's exports, so tests can import the built module.
        rolldownOptions: { input: entry, preserveEntrySignatures: 'strict' },
      },
    });
    const outputs = (Array.isArray(output) ? output : [output]) as Rolldown.RolldownOutput[];
    const code = outputs
      .flatMap((o) => o.output)
      .flatMap((chunk) => (chunk.type === 'chunk' ? [chunk.code] : []))
      .join('\n');
    return { code, logs };
  } finally {
    if (nodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = nodeEnv;
    rmSync(root, { recursive: true, force: true });
  }
}

/** Imports built code (one chunk, no imports) as a module. */
export async function importBuilt(code: string): Promise<Record<string, unknown>> {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-built-'));
  const file = join(dir, 'built.mjs');
  writeFileSync(file, code);
  try {
    return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<string, unknown>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The build's error (a failed build throws). */
export async function buildError(
  files: Readonly<Record<string, string>>,
  options: BuildOptions = {},
): Promise<Error & { frame?: string }> {
  try {
    await buildApp(files, options);
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('expected the build to fail');
}
