// Spec-field features in compiled builds (view/05-element.md "Features register themselves",
// gyral-c5d.12): view transitions, the frame lane and custom states are bundled only when some
// module the build transforms names `viewTransition`, `renderOnFrame` or `states`.
import { describe, expect, it } from 'vitest';
import { buildApp, CORE, VIEW } from './fixture.js';

/** An app whose component spec adds `extra`; `files` adds or replaces modules. */
const appWith = (extra: string, files: Record<string, string> = {}): Record<string, string> => ({
  'main.ts': `
    import { define } from ${JSON.stringify(CORE)};
    import { html } from ${JSON.stringify(VIEW)};
    export const C = define('x-c', {
      init: () => ({ on: false }),
      intent: {},
      update: { Flip: (s) => ({ on: !s.on }) },
      view: (s) => html\`<p>\${String(s.on)}</p>\`,
      ${extra}
    });
  `,
  ...files,
});

/** Which of the three features the production bundle carries. */
async function carried(files: Record<string, string>): Promise<Record<string, boolean>> {
  const { code } = await buildApp(files, { production: true });
  return {
    transitions: code.includes('startViewTransition'),
    frame: code.includes('requestAnimationFrame'),
    states: code.includes('attachInternals'),
  };
}

describe('spec-field features in compiled builds', () => {
  it('are left out when no module names them', async () => {
    expect(await carried(appWith(''))).toEqual({
      transitions: false,
      frame: false,
      states: false,
    });
  });

  it.each([
    ['transitions', 'viewTransition: () => true,'],
    ['frame', "renderOnFrame: ['Flip'],"],
    ['states', 'states: (s) => ({ on: s.on }),'],
  ])('carry %s when a spec names its field', async (feature, extra) => {
    const got = await carried(appWith(extra));
    expect(got).toEqual({
      transitions: feature === 'transitions',
      frame: feature === 'frame',
      states: feature === 'states',
    });
  });

  it('see a field named in another module, one without templates', async () => {
    const files = appWith('...extraSpec,', {
      'extra.ts': `export const extraSpec = { states: (s: { on: boolean }) => ({ on: s.on }) };`,
    });
    const main = files['main.ts'] ?? '';
    files['main.ts'] = `import { extraSpec } from './extra.ts';\n${main}`;
    expect((await carried(files)).states).toBe(true);
  });
});

/**
 * A package in the fixture's node_modules whose module names every spec field, in code, in
 * strings and in comments. `deps`: its package.json dependencies.
 */
const pkg = (name: string, deps: Record<string, string> = {}): Record<string, string> => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    version: '1.0.0',
    type: 'module',
    exports: './index.js',
    dependencies: deps,
  }),
  [`node_modules/${name}/index.js`]: `
    // invalid object states; a viewTransition and renderOnFrame in a comment
    export const options = { states: 1, viewTransition: true, renderOnFrame: ['Tick'] };
    export const describe = () => 'record states';
  `,
});

/** The app's component spreads `options` from `name` into nothing it renders, but imports it. */
const appUsing = (name: string, files: Record<string, string>): Record<string, string> => {
  const app = appWith('', files);
  app['main.ts'] =
    `import { options } from '${name}';\nexport const used = options;\n${app['main.ts'] ?? ''}`;
  return app;
};

describe('spec-field features: which modules are scanned', () => {
  it('skip installed packages that reach no Gyral package (effect, three)', async () => {
    expect(await carried(appUsing('plain', pkg('plain')))).toEqual({
      transitions: false,
      frame: false,
      states: false,
    });
  });

  it('scan installed packages that depend or peer-depend on a Gyral package', async () => {
    const all = { transitions: true, frame: true, states: true };
    expect(await carried(appUsing('ds', pkg('ds', { '@gyral/core': '*' })))).toEqual(all);
    const peer = pkg('peer-ds');
    peer['node_modules/peer-ds/package.json'] = JSON.stringify({
      name: 'peer-ds',
      type: 'module',
      exports: './index.js',
      peerDependencies: { '@gyral/core': '^0.3.0' },
    });
    expect(await carried(appUsing('peer-ds', peer))).toEqual(all);
  });

  it('scan installed packages that reach one through their own dependencies', async () => {
    const files = {
      ...pkg('widgets', { ds: '1.0.0' }),
      'node_modules/ds/package.json': JSON.stringify({
        name: 'ds',
        dependencies: { '@gyral/core': '*', widgets: '1.0.0' }, // a cycle, too
      }),
    };
    expect((await carried(appUsing('widgets', files))).states).toBe(true);
  });

  it("ignore the names in the app's comments and longer strings", async () => {
    const files = appWith('', {
      'notes.ts': `// states, viewTransition, renderOnFrame\nexport const note = 'the states of play';`,
    });
    files['main.ts'] =
      `import { note } from './notes.ts';\nexport { note };\n${files['main.ts'] ?? ''}`;
    expect(await carried(files)).toEqual({ transitions: false, frame: false, states: false });
  });

  it('ignore the word in an import path (gyral-shop: ../domain/us-states.js)', async () => {
    const files = appWith('', {
      'domain/us-states.ts': `export const US = ['AK', 'AL'];`,
      'forms.ts': `import { US } from './domain/us-states.ts';
export const lazy = () => import('./domain/us-states.ts');
export { US as options } from './domain/us-states.ts';
export const first = US[0];`,
    });
    files['main.ts'] = `import { first } from './forms.ts';
export { first };
${files['main.ts'] ?? ''}`;
    expect((await carried(files)).states).toBe(false);
  });
});
