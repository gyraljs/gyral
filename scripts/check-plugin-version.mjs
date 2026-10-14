// The skill plugin's version follows the release (@gyral/core's version; all packages share it).
//   node scripts/check-plugin-version.mjs          → fail when they differ (part of `pnpm invariants`)
//   node scripts/check-plugin-version.mjs --write  → set it (pnpm version-packages runs this)
import { readFileSync, writeFileSync } from 'node:fs';
import { checkPluginVersion } from './lib/invariants.mjs';

const FILE = '.claude-plugin/marketplace.json';
const release = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
let text = readFileSync(FILE, 'utf8');

if (process.argv.includes('--write')) {
  // Only the version fields change, so the file keeps its formatting.
  text = text.replace(/("version":\s*)"[^"]*"/g, `$1"${release}"`);
  writeFileSync(FILE, text);
}
const errors = checkPluginVersion(JSON.parse(text), release);
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`plugin version: ${release}`);
