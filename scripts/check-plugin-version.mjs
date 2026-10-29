// The skill plugin's version, and the VERSION constants of core and of each package, follow
// the release (@gyral/core's version; all packages share it).
//   node scripts/check-plugin-version.mjs          → fail when they differ (part of `pnpm invariants`)
//   node scripts/check-plugin-version.mjs --write  → set them (pnpm version-packages runs this)
import { readFileSync, writeFileSync } from 'node:fs';
import { checkPluginVersion, checkVersionConstant, VERSION_FILES } from './lib/invariants.mjs';

const FILE = '.claude-plugin/marketplace.json';
const release = JSON.parse(readFileSync('packages/core/package.json', 'utf8')).version;
const write = process.argv.includes('--write');
let text = readFileSync(FILE, 'utf8');
if (write) {
  // Only the version fields change, so the files keep their formatting.
  text = text.replace(/("version":\s*)"[^"]*"/g, `$1"${release}"`);
  writeFileSync(FILE, text);
}
const errors = checkPluginVersion(JSON.parse(text), release);
for (const file of VERSION_FILES) {
  let source = readFileSync(file, 'utf8');
  if (write) {
    source = source.replace(/(export const VERSION = )'[^']*'/, `$1'${release}'`);
    writeFileSync(file, source);
  }
  errors.push(...checkVersionConstant(file, source, release));
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`plugin and package versions: ${release}`);
