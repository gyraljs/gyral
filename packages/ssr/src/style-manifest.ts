/// <reference types="node" />
// Build-only, opt-in component registration in an isolated Node process (ADR 0031).
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { InlineConfig } from 'vite';

export interface ComponentStyleManifest {
  readonly schema: 1;
  /** Sorted, deduplicated, quoted CSP SHA-256 sources for actual serialized shadow styles. */
  readonly hashes: readonly string[];
}
export interface ComponentStyleManifestOptions {
  /** Application root used by its client build. Its component modules must be SSR-safe. */
  readonly root: string;
  /** Client output from `gyralVitePreset({ components: true })`, including `.vite` metadata. */
  readonly clientDir: string;
  /** Standalone JSON deployment artifact; no component module is needed to read it later. */
  readonly outFile: string;
  /** Build-time aliases/plugins used by application modules. No config file is loaded. */
  readonly vite?: InlineConfig;
}
const execute = promisify(execFile);

/**
 * After the client build, automatically import its discovered/listed component modules in a
 * temporary SSR bundle and fresh Node process, then write their real `styleHashes()` as JSON.
 * This executes trusted application module initialization at BUILD time: modules must be
 * SSR-safe. It is not AST guessing and must not run against untrusted source. Vite is loaded
 * only when invoked; production reads the resulting JSON into `CspOptions.componentStyleHashes`.
 */
export async function writeComponentStyleManifest(
  options: ComponentStyleManifestOptions,
): Promise<ComponentStyleManifest> {
  const root = resolve(options.root);
  const metadata = JSON.parse(
    await readFile(join(options.clientDir, '.vite/gyral-components.json'), 'utf8'),
  ) as { readonly modules: Readonly<Record<string, string>> };
  const modules = [...new Set(Object.values(metadata.modules))].sort();
  const outFile = resolve(options.outFile);
  await mkdir(dirname(outFile), { recursive: true });
  const temp = await mkdtemp(join(root, '.gyral-styles-'));
  const stagedFile = join(temp, 'styles.json');
  try {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      join(temp, 'package.json'),
      JSON.stringify({ type: 'module', sideEffects: true }),
    );
    const imports = modules
      .map((module) => `import ${JSON.stringify(resolve(root, module))};`)
      .join('\n');
    const entry = join(temp, 'styles.mjs');
    await writeFile(
      entry,
      `${imports}\nimport { styleHashes } from ${JSON.stringify(fileURLToPath(new URL('./index.js', import.meta.url)))};\nimport { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(stagedFile)}, JSON.stringify({ schema: 1, hashes: [...await styleHashes()].sort() }) + '\\n');\n`,
    );
    const { build } = await import('vite');
    await build({
      ...options.vite,
      root,
      configFile: false,
      logLevel: 'silent',
      ssr: { ...options.vite?.ssr, noExternal: ['@gyral/core', '@gyral/ssr'] },
      build: {
        ssr: entry,
        outDir: join(temp, 'out'),
        emptyOutDir: true,
        rolldownOptions: {
          output: { codeSplitting: false, format: 'es', entryFileNames: 'styles.mjs' },
        },
      },
    });
    await execute(process.execPath, [join(temp, 'out/styles.mjs')], { timeout: 30_000 });
    const result: unknown = JSON.parse(await readFile(stagedFile, 'utf8'));
    if (
      typeof result !== 'object' ||
      result === null ||
      !('schema' in result) ||
      result.schema !== 1 ||
      !('hashes' in result) ||
      !Array.isArray(result.hashes) ||
      !result.hashes.every(
        (hash: unknown) => typeof hash === 'string' && /^'sha256-[A-Za-z0-9+/]{43}='$/.test(hash),
      )
    )
      throw new Error('Invalid component style metadata');
    await rename(stagedFile, outFile);
    return { schema: 1, hashes: result.hashes as readonly string[] };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
