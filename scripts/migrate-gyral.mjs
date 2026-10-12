// Dry run by default: prints reviewable source and warnings. --write opts into local edits.
import { readFileSync, writeFileSync } from 'node:fs';
import { migrateGyral } from './lib/migrate-gyral.mjs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const files = args.filter((arg) => arg !== '--write');
if (files.length === 0 || files.some((file) => file.startsWith('--'))) {
  console.error('Usage: node scripts/migrate-gyral.mjs [--write] src/component.ts [more files…]');
  process.exitCode = 2;
} else {
  for (const file of files) {
    const original = readFileSync(file, 'utf8');
    const result = migrateGyral(original, file);
    console.log(
      `${file}: ${result.edits} edit(s), ${result.warnings.length} review item(s)${write ? ' (write)' : ' (dry run)'}`,
    );
    for (const warning of result.warnings) console.error(warning);
    if (result.code !== original) {
      if (write) writeFileSync(file, result.code);
      else console.log(result.code);
    }
  }
}
