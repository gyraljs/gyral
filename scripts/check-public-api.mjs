import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findEffectLeaks } from './lib/invariants.mjs';

function dtsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? dtsFiles(join(dir, e.name))
      : e.name.endsWith('.d.ts')
        ? [join(dir, e.name)]
        : [],
  );
}

const errors = [];
for (const pkg of readdirSync('packages')) {
  const project = join('packages', pkg, 'tsconfig.build.json');
  if (!existsSync(project)) continue;
  const out = mkdtempSync(join(tmpdir(), `gyral-${pkg}-`));
  const tsc = spawnSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '-p',
      project,
      '--emitDeclarationOnly',
      '--declarationMap',
      'false',
      '--outDir',
      out,
    ],
    { encoding: 'utf8' },
  );
  if (tsc.status !== 0) {
    errors.push(`${project}: declaration build failed\n${tsc.stdout}${tsc.stderr}`);
  } else {
    for (const file of dtsFiles(out)) {
      // Internal modules may use Effect; only what index.d.ts can reach is public.
      if (file.includes(`${join(out, 'internal')}`)) continue;
      errors.push(
        ...findEffectLeaks(file.replace(out, `packages/${pkg}/dist`), readFileSync(file, 'utf8')),
      );
    }
  }
  rmSync(out, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('public API: no Effect types in published declarations');
