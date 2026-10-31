// Builds one package for publishing (run from its directory by `pnpm build` and `prepack`):
// a clean dist/ from tsconfig.build.json, plus the repo's LICENSE and NOTICE beside package.json.
// A package whose published exports point into dist/prod/ (core) also gets its production tree
// there: the same modules without their development code (lib/prod-build.mjs, gyral-gpr).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { buildProduction } from './lib/prod-build.mjs';

const root = join(import.meta.dirname, '..');

rmSync('dist', { recursive: true, force: true });
const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
for (const file of ['LICENSE', 'NOTICE']) copyFileSync(join(root, file), file);
// Data files a package publishes as-is (core's errors.json, the diagnostics table): src/*.json.
if (existsSync('src')) {
  for (const file of readdirSync('src')) {
    if (file.endsWith('.json')) copyFileSync(join('src', file), join('dist', file));
  }
}
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
await buildProduction('.', { ...manifest, ...manifest.publishConfig });
