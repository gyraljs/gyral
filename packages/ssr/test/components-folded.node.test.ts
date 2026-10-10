// Automatic component loading when the bundler folds a component's module into another chunk
// (the entry, or a component that imports it statically), and for components defined through a
// wrapper, which the scan can't see and the app lists in `components.modules` (gyral-1zd.30).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { build } from 'vite';
import { gyralVitePreset } from '@gyral/core/vite';
import { componentsFromManifest } from '../src/static.js';

const files: Record<string, string> = {
  // The entry imports two discovered components statically: both end up in its chunk.
  'src/main.ts': `
    import './card.js';
    import './shell.js';
  `,
  'src/card.ts': `
    import { define, html } from '@gyral/core';
    export const Card = define()('ft-card', { init: () => ({}), view: () => html\`<p>card</p>\` });
  `,
  // A component that imports another component statically.
  'src/shell.ts': `
    import { define, html } from '@gyral/core';
    import './badge.js';
    export const Shell = define()('ft-shell', { init: () => ({}), view: () => html\`<ft-badge></ft-badge>\` });
  `,
  'src/badge.ts': `
    import { define, html } from '@gyral/core';
    export const Badge = define()('ft-badge', { init: () => ({}), view: () => html\`<b>!</b>\` });
  `,
  // Defined through a wrapper: the tag isn't a literal at the define() call.
  'src/forms/member.ts': `
    import { define, html } from '@gyral/core';
    function defineMemberForm(options: { readonly tag: string }) {
      return define()(options.tag, { init: () => ({}), view: () => html\`<form></form>\` });
    }
    export const MemberForm = defineMemberForm({ tag: 'ft-member' });
  `,
};

let root = '';
beforeAll(() => {
  root = mkdtempSync(join(import.meta.dirname, '.tmp-components-folded-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function buildApp(dist: string, components: Parameters<typeof gyralVitePreset>[0]) {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    ...gyralVitePreset(components),
    build: {
      outDir: dist,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { input: { main: join(root, 'src/main.ts') } },
    },
  });
  return JSON.parse(readFileSync(join(dist, '.vite', 'gyral-components.json'), 'utf8')) as {
    loader: string;
    modules: Record<string, string>;
    chunks: Record<string, string>;
  };
}

it('serves components whose module was folded into the entry or another component', async () => {
  const dist = join(root, 'dist-folded');
  const written = await buildApp(dist, { components: true });
  expect(Object.keys(written.chunks).sort()).toEqual(['ft-badge', 'ft-card', 'ft-shell']);
  // `productionServer` calls this at startup: it used to throw for a folded module.
  const components = await componentsFromManifest(dist);
  for (const tag of ['ft-card', 'ft-shell', 'ft-badge']) {
    // Each preloads the chunk its module is in.
    expect(components?.modules.get(tag)?.preload, tag).toContain(`/${written.chunks[tag] ?? tag}`);
  }
}, 60_000);

it('loads components the app lists in components.modules (defined through a wrapper)', async () => {
  const dist = join(root, 'dist-listed');
  const written = await buildApp(dist, {
    components: { modules: { 'ft-member': 'src/forms/member.ts' } },
  });
  expect(written.modules['ft-member']).toBe('src/forms/member.ts');
  expect(readFileSync(join(dist, written.loader), 'utf8')).toContain('ft-member');
  const components = await componentsFromManifest(dist);
  expect(components?.modules.get('ft-member')?.preload).toContain(
    `/${written.chunks['ft-member'] ?? 'missing'}`,
  );
}, 60_000);
