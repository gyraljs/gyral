import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, pageFile, pageId, parseIndex } from './docs.mjs';

export const ROOT = resolve(import.meta.dirname, '../..');
export const IMAGE = 'sha256:3880cf501a3b54bacc5e53dc327478ba723084863fa252cceb43f75aadcab12b';
export const CONDITIONS = ['gyral-docs', 'gyral-assisted', 'react-docs', 'svelte-docs'];
export const TASKS = ['feature', 'bug', 'form'];
export const FRAMEWORKS = ['gyral', 'react', 'svelte'];
export const PROTOCOL = 'v3';
export const GYRAL_VERSION = '0.3.9';
/** Precreated, empty mountpoint for generated build output (see sandbox.mjs). */
export const GENERATED_DIR = '.gyral';
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

const dependencies = (gyral) => ({
  gyral: { '@gyral/core': gyral },
  react: { react: '19.3.0', 'react-dom': '19.3.0' },
  svelte: { svelte: '5.57.2' },
});
const extras = {
  gyral: { parse5: '8.0.1' },
  react: { '@types/react': '19.3.0', '@types/react-dom': '19.3.0' },
  svelte: { '@sveltejs/vite-plugin-svelte': '7.3.1', 'svelte-check': '4.7.6' },
};

function skeleton(dir, framework, gyral) {
  mkdirSync(join(dir, 'src'), { recursive: true });
  save(join(dir, 'package.json'), {
    name: `pilot-${framework}`,
    private: true,
    type: 'module',
    dependencies: dependencies(gyral)[framework],
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

// The seeded bug, the same defect in each framework's idiom: a row's filtered (visible)
// position is used as a position in the full list instead of the row's own identity.
const TOGGLE = {
  gyral: { correct: 'item.id', bug: 's.items[shown.indexOf(item)]?.id' },
  react: { correct: 'item.id', bug: 'items[index]?.id' },
  svelte: { correct: 'item.id', bug: 'items[index]?.id' },
};

export function fixtureSource(framework, task, reference = false) {
  const kind =
    task === 'bug' || (task === 'feature' && reference)
      ? 'tasks'
      : task === 'form' && reference
        ? 'signup'
        : 'blank';
  const ext = framework === 'gyral' ? 'ts' : framework === 'react' ? 'tsx' : 'svelte';
  const source = readFileSync(
    join(import.meta.dirname, 'fixtures', framework, `${kind}.${ext}.txt`),
    'utf8',
  );
  const toggle = TOGGLE[framework];
  return source.replace(
    '__TOGGLE_ID__',
    task === 'bug' && !reference ? toggle.bug : toggle.correct,
  );
}

export function installFixture(dir, framework, task, reference = false) {
  writeFileSync(join(dir, targetFile(framework)), fixtureSource(framework, task, reference));
}

// Documentation (protocol v3, H1): every framework gets an llms.txt-style index plus each
// listed page's Markdown, fetched from the framework's own site and frozen with hashes.
export const DOC_INDEXES = {
  gyral: { index: 'https://gyral.dev/llms.txt' },
  react: { index: 'https://react.dev/llms.txt' },
  svelte: {
    // svelte.dev/llms.txt links whole-documentation files only, so the per-page index is the
    // Svelte package's page list (sveltejs/svelte documentation/docs at a recorded revision),
    // each linked to its svelte.dev per-page Markdown endpoint.
    index: 'https://svelte.dev/llms.txt',
    repository: 'sveltejs/svelte',
    directory: 'documentation/docs/',
    page: (slug) => `https://svelte.dev/docs/svelte/${slug}/llms.txt`,
  },
};

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  if (/text\/html/.test(response.headers.get('content-type') ?? ''))
    throw new Error(`HTML instead of Markdown: ${url}`);
  return {
    text,
    retrievedAt: new Date().toISOString(),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

async function pool(items, size, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index], index);
      }
    }),
  );
  return results;
}

const frontTitle = (text) => /^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?\n---/m.exec(text)?.[1].trim();

async function svelteIndex(source) {
  const root = await fetchText(source.index);
  const summary = parseIndex(root.text).summary;
  const commit = await fetch(`https://api.github.com/repos/${source.repository}/commits/main`, {
    signal: AbortSignal.timeout(30_000),
  }).then((response) => response.json());
  const revision = commit.sha;
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) throw new Error('Svelte revision unavailable');
  const tree = await fetch(
    `https://api.github.com/repos/${source.repository}/git/trees/${revision}?recursive=1`,
    { signal: AbortSignal.timeout(30_000) },
  ).then((response) => response.json());
  if (tree.truncated) throw new Error('Svelte docs tree truncated');
  const files = tree.tree
    .filter(
      (entry) =>
        entry.type === 'blob' &&
        entry.path.startsWith(source.directory) &&
        entry.path.endsWith('.md') &&
        !entry.path.includes('/.generated/'),
    )
    .map((entry) => entry.path)
    .sort();
  const raw = (path) =>
    fetchText(`https://raw.githubusercontent.com/${source.repository}/${revision}/${path}`);
  const texts = Object.fromEntries(
    await pool(files, 6, async (path) => [path, (await raw(path)).text]),
  );
  const lines = [`# Svelte`, '', `> ${summary}`, ''];
  let group;
  for (const path of files) {
    const parts = path.slice(source.directory.length).split('/');
    if (parts.length !== 2 || parts[1] === 'index.md') continue;
    const section = frontTitle(texts[`${source.directory}${parts[0]}/index.md`] ?? '') ?? parts[0];
    if (section !== group) lines.push('', `## ${(group = section)}`, '');
    const slug = parts[1].replace(/^\d+-/, '').replace(/\.md$/, '');
    lines.push(`- [${frontTitle(texts[path]) ?? slug}](${source.page(slug)})`);
  }
  return {
    text: `${lines.join('\n')}\n`,
    upstream: {
      url: source.index,
      sha256: sha256(root.text),
      retrievedAt: root.retrievedAt,
      pageList: `https://github.com/${source.repository}/tree/${revision}/${source.directory}`,
      revision,
    },
  };
}

export async function freezeDocs(dir, framework) {
  const source = DOC_INDEXES[framework];
  let index;
  let upstream;
  if (framework === 'svelte') ({ text: index, upstream } = await svelteIndex(source));
  else {
    const fetched = await fetchText(source.index);
    index = fetched.text;
    upstream = { url: source.index, retrievedAt: fetched.retrievedAt };
  }
  const parsed = parseIndex(index);
  const seen = new Set();
  const entries = parsed.entries.filter((entry) => {
    const id = pageId(entry.url);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(join(dir, 'llms.txt'), index);
  const unavailable = [];
  const pages = (
    await pool(entries, 6, async (entry) => {
      const id = pageId(entry.url);
      try {
        const page = await fetchText(entry.url);
        const file = pageFile(id);
        writeFileSync(join(dir, file), page.text);
        return {
          id,
          title: entry.title,
          group: entry.group,
          description: describe(entry.description, page.text),
          url: entry.url,
          file,
          sha256: sha256(page.text),
          bytes: Buffer.byteLength(page.text),
          retrievedAt: page.retrievedAt,
          etag: page.etag,
          lastModified: page.lastModified,
        };
      } catch (error) {
        unavailable.push({ id, url: entry.url, error: String(error) });
        return undefined;
      }
    })
  ).filter(Boolean);
  if (unavailable.length > Math.ceil(entries.length * 0.05))
    throw new Error(`${framework}: ${unavailable.length} of ${entries.length} pages unavailable`);
  save(join(dir, 'sources.json'), {
    framework,
    summary: parsed.summary,
    index: { file: 'llms.txt', sha256: sha256(index), ...upstream },
    pages,
    unavailable,
    totalBytes: pages.reduce((sum, page) => sum + page.bytes, 0),
  });
  console.log(`${framework}: ${pages.length} pages, ${unavailable.length} unavailable`);
}

function freezeSkill(dir, released) {
  const pages = [];
  for (const entry of released.skill) {
    const file = join(dir, entry.path);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, entry.content);
    if (!entry.path.endsWith('.md')) continue;
    const title = /^#\s+(.+)$/m.exec(entry.content)?.[1].trim() ?? entry.path.replace(/\.md$/, '');
    pages.push({
      id: `skill/${entry.path.replace(/\.md$/, '')}`,
      title,
      group: `Released Gyral skill (@gyral/mcp@${released.version})`,
      description: describe('', entry.content),
      url: `gyral://skill/${entry.path === 'SKILL.md' ? '' : entry.path}`.replace(/\/$/, ''),
      file: entry.path,
      sha256: sha256(entry.content),
      bytes: Buffer.byteLength(entry.content),
    });
  }
  save(join(dir, 'sources.json'), {
    framework: 'gyral-skill',
    summary: '',
    source: `@gyral/mcp@${released.version}/dist/corpus.json`,
    pages,
  });
}

export async function prepare(dir, { gyral = GYRAL_VERSION } = {}) {
  mkdirSync(dir); // Freeze into a new directory; never overwrite earlier corpus/results.
  for (const framework of FRAMEWORKS) {
    const seed = join(dir, 'seeds', framework);
    skeleton(seed, framework, gyral);
    installFixture(seed, framework, 'feature');
    console.log(`Installing registry-only ${framework} seed`);
    execFileSync(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'],
      { cwd: seed, stdio: 'inherit', timeout: 180_000 },
    );
    await freezeDocs(join(dir, 'docs', framework), framework);
  }
  const mcp = join(dir, 'mcp');
  mkdirSync(mcp);
  save(join(mcp, 'package.json'), {
    private: true,
    type: 'module',
    dependencies: { '@gyral/mcp': gyral, typescript: '6.0.3' },
  });
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'],
    { cwd: mcp, stdio: 'inherit', timeout: 180_000 },
  );
  const released = JSON.parse(readFileSync(join(mcp, 'node_modules/@gyral/mcp/dist/corpus.json')));
  if (released.version !== gyral) throw new Error('Wrong released MCP version');
  freezeSkill(join(dir, 'docs', 'skill'), released);
  save(join(dir, 'frozen.json'), {
    version: 3,
    protocol: PROTOCOL,
    gyralVersion: gyral,
    frozenAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
    sourceHashes: sourceSnapshot(),
    corpusHashes: hashes(dir),
    image: IMAGE,
    mcpDocs: {
      pages: released.docs.length,
      note: 'The released MCP server answers from its own bundled docs snapshot; the base docs above are the same for both Gyral conditions.',
    },
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
  mkdirSync(join(destination, GENERATED_DIR), { recursive: true });
}
