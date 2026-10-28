// The skill plugin's version, and core's VERSION constant, follow the release (@gyral/core's
// version; all packages share it).
//   node scripts/check-plugin-version.mjs          → fail when they differ (part of `pnpm invariants`)
//   node scripts/check-plugin-version.mjs --write  → set them (pnpm version-packages runs this)
import { readFileSync, writeFileSync } from 'node:fs';
import { checkCoreVersion, checkPluginVersion } from './lib/invariants.mjs';

const FILE = '.claude-plugin/marketplace.json';
const VERSION_FILE = 'packages/core/src/view/version.ts';
const release = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
let text = readFileSync(FILE, 'utf8');
let source = readFileSync(VERSION_FILE, 'utf8');

if (process.argv.includes('--write')) {
  // Only the version fields change, so the files keep their formatting.
  text = text.replace(/("version":\s*)"[^"]*"/g, `$1"${release}"`);
  writeFileSync(FILE, text);
  source = source.replace(/(export const VERSION = )'[^']*'/, `$1'${release}'`);
  writeFileSync(VERSION_FILE, source);
}
const errors = [
  ...checkPluginVersion(JSON.parse(text), release),
  ...checkCoreVersion(source, release),
];
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`plugin and core versions: ${release}`);
