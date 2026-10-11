import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '../..');
export const IMAGE = 'sha256:3880cf501a3b54bacc5e53dc327478ba723084863fa252cceb43f75aadcab12b';
export const CONDITIONS = ['gyral-docs', 'gyral-assisted', 'react-docs', 'svelte-docs'];
export const TASKS = ['feature', 'bug', 'form'];
export const FRAMEWORKS = ['gyral', 'react', 'svelte'];
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const save = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

export function hashes(dir) {
  const files = [];
  const walk = (path = '') => {
    for (const entry of readdirSync(join(dir, path), { withFileTypes: true })) {
      if (['node_modules', 'dist', 'frozen.json'].includes(entry.name)) continue;
      const name = join(path, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(name);
    }
  };
  walk();
  return Object.fromEntries(
    files.sort().map((name) => [name, sha256(readFileSync(join(dir, name)))]),
  );
}
export function sourceSnapshot() {
  return {
    ...hashes(import.meta.dirname),
    '../agent-pilot.mjs': sha256(readFileSync(join(ROOT, 'scripts/agent-pilot.mjs'))),
  };
}

const dependencies = {
  gyral: { '@gyral/core': '0.3.1' },
  react: { react: '19.3.0', 'react-dom': '19.3.0' },
  svelte: { svelte: '5.57.2' },
};
const extras = {
  gyral: { parse5: '8.0.1' },
  react: { '@types/react': '19.3.0', '@types/react-dom': '19.3.0' },
  svelte: { '@sveltejs/vite-plugin-svelte': '7.3.1', 'svelte-check': '4.7.6' },
};

function skeleton(dir, framework) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  save(join(dir, 'package.json'), {
    name: `pilot-${framework}`,
    private: true,
    type: 'module',
    dependencies: dependencies[framework],
    devDependencies: { vite: '8.3.2', typescript: '6.0.3', ...extras[framework] },
  });
  save(join(dir, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2023', 'DOM', 'DOM.Iterable'],
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      jsx: 'react-jsx',
      types: ['vite/client'],
    },
    include: ['src', 'vite.config.ts'],
  });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Agent pilot</title></head><body><main id="app"></main><script type="module" src="/src/main.ts"></script></body></html>\n',
  );
  const configs = {
    gyral:
      "import {gyralVitePreset} from '@gyral/core/vite'; export default {...gyralVitePreset({clientOnly:true})};\n",
    react: 'export default {};\n',
    svelte:
      "import {svelte} from '@sveltejs/vite-plugin-svelte'; export default {plugins:[svelte()]};\n",
  };
  writeFileSync(join(dir, 'vite.config.ts'), configs[framework]);
  if (framework === 'react')
    writeFileSync(
      join(dir, 'src/main.ts'),
      "import {createRoot} from 'react-dom/client'; import {createElement} from 'react'; import App from './App'; const root=document.querySelector('main'); if(root)createRoot(root).render(createElement(App));\n",
    );
  if (framework === 'svelte') {
    writeFileSync(join(dir, 'svelte.config.js'), 'export default {};\n');
    writeFileSync(
      join(dir, 'src/main.ts'),
      "import {mount} from 'svelte'; import App from './App.svelte'; const target=document.querySelector('main'); if(target)mount(App,{target});\n",
    );
    writeFileSync(join(dir, 'src/env.d.ts'), '/// <reference types="svelte" />\n');
  }
}

export const targetFile = (framework) =>
  framework === 'gyral' ? 'src/main.ts' : framework === 'react' ? 'src/App.tsx' : 'src/App.svelte';

export function installFixture(dir, framework, task, reference = false) {
  const kind =
    task === 'bug' || (task === 'feature' && reference)
      ? 'tasks'
      : task === 'form' && reference
        ? 'signup'
        : 'blank';
  const ext = framework === 'gyral' ? 'ts' : framework === 'react' ? 'tsx' : 'svelte';
  let source = readFileSync(
    join(import.meta.dirname, 'fixtures', framework, `${kind}.${ext}.txt`),
    'utf8',
  );
  const correct = framework === 'gyral' ? 'msg.id' : 'item.id';
  const bug = framework === 'gyral' ? 's.items[msg.index]?.id' : 'items[index]?.id';
  source = source.replace('__TOGGLE_ID__', task === 'bug' && !reference ? bug : correct);
  writeFileSync(join(dir, targetFile(framework)), source);
}

const docSources = {
  react: {
    revision: '046f17d04295ba047bb5739026b4ac3110f17028',
    repository: 'reactjs/react.dev',
    paths: [
      'src/content/learn/state-a-components-memory.md',
      'src/content/learn/updating-arrays-in-state.md',
      'src/content/learn/rendering-lists.md',
      'src/content/reference/react-dom/components/input.md',
      'src/content/reference/react/useRef.md',
    ],
  },
  svelte: {
    revision: '707c28146b0f0a6d5404a1bd4769874c3c24851a',
    repository: 'sveltejs/svelte',
    paths: [
      'documentation/docs/02-runes/02-$state.md',
      'documentation/docs/02-runes/03-$derived.md',
      'documentation/docs/03-template-syntax/01-basic-markup.md',
      'documentation/docs/03-template-syntax/03-each.md',
      'documentation/docs/03-template-syntax/12-bind.md',
    ],
  },
};

export async function prepare(dir) {
  mkdirSync(dir); // Freeze into a new directory; never overwrite earlier corpus/results.
  for (const framework of FRAMEWORKS) {
    const seed = join(dir, 'seeds', framework);
    skeleton(seed, framework);
    installFixture(seed, framework, 'feature');
    console.log(`Installing registry-only ${framework} seed`);
    execFileSync(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'],
      { cwd: seed, stdio: 'inherit', timeout: 180_000 },
    );
    const docs = join(dir, 'docs', framework);
    mkdirSync(docs, { recursive: true });
    if (framework === 'gyral')
      cpSync(join(ROOT, 'packages/mcp/data/llms-full.txt'), join(docs, 'consumer.txt'));
    else {
      const source = docSources[framework];
      const evidence = [];
      for (const path of source.paths) {
        const url = `https://raw.githubusercontent.com/${source.repository}/${source.revision}/${path}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Official docs HTTP ${response.status}: ${url}`);
        const text = await response.text();
        const file = path.split('/').at(-1);
        writeFileSync(join(docs, file), text);
        evidence.push({
          file,
          url,
          revision: source.revision,
          sha256: sha256(text),
          retrievedAt: new Date().toISOString(),
        });
      }
      save(join(docs, 'sources.json'), evidence);
    }
  }
  const mcp = join(dir, 'mcp');
  mkdirSync(mcp);
  save(join(mcp, 'package.json'), {
    private: true,
    type: 'module',
    dependencies: { '@gyral/mcp': '0.3.1', typescript: '6.0.3' },
  });
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'],
    { cwd: mcp, stdio: 'inherit', timeout: 180_000 },
  );
  const released = JSON.parse(readFileSync(join(mcp, 'node_modules/@gyral/mcp/dist/corpus.json')));
  if (released.version !== '0.3.1') throw new Error('Wrong released MCP version');
  const { parseLlmsFull } = await import(
    pathToFileURL(join(mcp, 'node_modules/@gyral/mcp/dist/docs.js')).href
  );
  assert.deepEqual(
    parseLlmsFull(readFileSync(join(dir, 'docs/gyral/consumer.txt'), 'utf8')),
    released.docs,
    'Ordinary docs must match the released MCP corpus',
  );
  save(join(dir, 'docs/gyral/sources.json'), {
    url: 'https://gyral.dev/llms-full.txt',
    verifiedAgainst: '@gyral/mcp@0.3.1/dist/corpus.json',
    pages: released.docs.length,
    sha256: sha256(readFileSync(join(dir, 'docs/gyral/consumer.txt'))),
    retrievedAt: new Date().toISOString(),
  });
  const skill = join(dir, 'docs', 'skill');
  mkdirSync(skill);
  for (const entry of released.skill) {
    const file = join(skill, entry.path);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, entry.content);
  }
  save(join(dir, 'frozen.json'), {
    version: 1,
    frozenAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
    sourceHashes: hashes(import.meta.dirname),
    corpusHashes: hashes(dir),
    image: IMAGE,
  });
  console.log(`Frozen corpus: ${dir}`);
}

export function workspace(corpus, destination, framework, task, reference = false) {
  if (!existsSync(join(corpus, 'frozen.json'))) throw new Error('Prepare a frozen corpus first.');
  cpSync(join(corpus, 'seeds', framework), destination, {
    recursive: true,
    filter: (path) => !path.split('/').includes('node_modules'),
  });
  installFixture(destination, framework, task, reference);
  mkdirSync(join(destination, 'node_modules'), { recursive: true });
}
