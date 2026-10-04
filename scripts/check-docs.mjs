import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { relativeLinks } from './lib/invariants.mjs';

const MAX_AGENTS_LINES = 120;
const errors = [];

const agents = readFileSync('AGENTS.md', 'utf8');
const agentLines = agents.split('\n').length;
if (agentLines > MAX_AGENTS_LINES) {
  errors.push(
    `AGENTS.md has ${agentLines} lines (max ${MAX_AGENTS_LINES}). It is a map, not a manual: ` +
      `move detail into docs/ and link to it.`,
  );
}

const designDir = 'docs/design-docs';
const index = readFileSync(join(designDir, 'index.md'), 'utf8');
for (const file of readdirSync(designDir)) {
  if (file.endsWith('.md') && file !== 'index.md' && !index.includes(`(${file})`)) {
    errors.push(`${designDir}/${file} is not listed in ${designDir}/index.md. Add a row for it.`);
  }
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? markdownFiles(join(dir, e.name))
      : e.name.endsWith('.md')
        ? [join(dir, e.name)]
        : [],
  );
}

for (const file of ['AGENTS.md', 'ARCHITECTURE.md', 'README.md', ...markdownFiles('docs')]) {
  for (const href of relativeLinks(readFileSync(file, 'utf8'))) {
    if (!existsSync(join(dirname(file), href))) {
      errors.push(`${file}: broken link "${href}". Fix the path or remove the link.`);
    }
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('docs: map size, design-doc index and links OK');
