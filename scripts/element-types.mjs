// Writes each example's and template's generated element typings (.gyral/elements.d.ts,
// gyral-1zd.25) before the repo-wide type check, which runs tsc without Vite. The same
// generator gyralVitePreset() and the gyral-types CLI use.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeTagMap } from '../packages/core/src/compiler/tag-map.ts';

const root = join(import.meta.dirname, '..');
const projects = [
  ...readdirSync(join(root, 'examples')).map((d) => join(root, 'examples', d)),
  ...readdirSync(join(root, 'packages/create-gyral/templates')).map((d) =>
    join(root, 'packages/create-gyral/templates', d),
  ),
].filter((dir) => existsSync(join(dir, 'src')));

let elements = 0;
for (const dir of projects) elements += writeTagMap({ root: dir }).entries.length;
console.log(`element-types: ${String(elements)} elements in ${String(projects.length)} projects`);
