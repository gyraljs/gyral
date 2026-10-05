// Builds one package for publishing (run from its directory by `pnpm build` and `prepack`):
// a clean dist/ from tsconfig.build.json, plus the repo's LICENSE and NOTICE beside package.json.
import { spawnSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

rmSync('dist', { recursive: true, force: true });
const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
for (const file of ['LICENSE', 'NOTICE']) copyFileSync(join(root, file), file);
