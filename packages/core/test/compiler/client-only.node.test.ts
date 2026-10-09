// Client-only builds (gyralVitePreset({ clientOnly: true }), view/07-hydration.md "Client-only
// builds", gyral-c5d.11): the browser bundle has no hydration code, and the invoker-command
// fallback's import() only when a module may make a root listen for `command`
// (compiler/features.ts). Without the option nothing changes.
import { defaultClientConditions, defaultServerConditions, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { gyralVitePreset } from '../../src/vite.js';
import { buildApp, CORE, VIEW } from './fixture.js';

const COMPILED_CONDITION = 'gyral-compiled';
const CLIENT_ONLY_CONDITION = 'gyral-client-only';
const CLIENT_CONDITIONS = [...defaultClientConditions];
const SERVER_CONDITIONS = defaultServerConditions.filter((c) => c !== 'browser');

/** A component whose view is `markup` (an html template body) and whose spec adds `extra`. */
const component = (markup: string, extra = ''): Record<string, string> => ({
  'main.ts': `
    import { define } from ${JSON.stringify(CORE)};
    import { html } from ${JSON.stringify(VIEW)};
    export const C = define()('x-c', {
      init: () => ({}),
      intent: { Run: () => ({ _tag: 'Run' }) },
      update: { Run: (s) => s },
      view: (_s, i) => html\`${markup}\`,
      ${extra}
    });
  `,
});

const dynamicImports = async (
  files: Record<string, string>,
  clientOnly: boolean,
): Promise<string[]> => {
  const built = await buildApp(files, { production: true, clientOnly });
  return built.chunks.flatMap((chunk) => chunk.dynamicImports).sort();
};

const button = '<button data-intent=${i.Run}>Run</button>';

describe('client-only builds', () => {
  it('come from a plugin placed before the template compiler (it reads authored templates)', () => {
    const names = gyralVitePreset({ clientOnly: true }).plugins.map((p) => p.name);
    expect(names.slice(0, 2)).toEqual(['gyral:client-only', 'gyral:template-compiler']);
    expect(gyralVitePreset().plugins.map((p) => p.name)).not.toContain('gyral:client-only');
  });

  it('add the gyral-client-only condition to browser environments only, also in serve', async () => {
    for (const command of ['build', 'serve'] as const) {
      const config = await resolveConfig(
        {
          configFile: false,
          logLevel: 'silent',
          ...gyralVitePreset({ clientOnly: true }),
          environments: { ssr: {} },
        },
        command,
      );
      const compiled = command === 'build' ? [COMPILED_CONDITION] : [];
      expect(config.environments['client']?.resolve.conditions).toEqual(
        command === 'build'
          ? [...CLIENT_CONDITIONS, CLIENT_ONLY_CONDITION, COMPILED_CONDITION]
          : [...CLIENT_CONDITIONS, CLIENT_ONLY_CONDITION],
      );
      expect(config.environments['ssr']?.resolve.conditions).toEqual([
        ...SERVER_CONDITIONS,
        ...compiled,
      ]);
    }
  });

  it('leave out the hydration chunk and, without command intents, the invoker fallback', async () => {
    const files = component(button);
    expect(await dynamicImports(files, true)).toEqual([]);
    const full = await dynamicImports(files, false);
    expect(full.some((name) => name.includes('hydration-client'))).toBe(true);
    expect(full.some((name) => name.includes('invokers-shim'))).toBe(true);
  });

  it.each([
    [
      'a static data-intent-on="command"',
      `<div data-intent=\${i.Run} data-intent-on="command"></div>`,
      '',
    ],
    ['an unquoted one', `<div data-intent=\${i.Run} data-intent-on=command></div>`, ''],
    ['a bound data-intent-on', `<div data-intent=\${i.Run} data-intent-on=\${'click'}></div>`, ''],
    ['a per-event command intent', `<div data-intent-command=\${i.Run}></div>`, ''],
    ['spec.events with command', button, `events: ['command'],`],
  ])('keep the invoker fallback for %s', async (_name, markup, extra) => {
    const imports = await dynamicImports(component(markup, extra), true);
    expect(imports.length).toBe(1);
    expect(imports[0]).toMatch(/invokers-shim/);
  });

  it('keep the invoker fallback when a module calls raw() (markup read at run time)', async () => {
    const files = {
      ...component(button),
      'other.ts': `
        import { raw } from ${JSON.stringify(VIEW)};
        export const trusted = (s: string) => raw(s);
      `,
      'main.ts': `${component(button)['main.ts'] ?? ''}\nexport { trusted } from './other.ts';`,
    };
    expect(await dynamicImports(files, true)).toEqual([expect.stringMatching(/invokers-shim/)]);
  });

  it('ignore other data-intent-on values and the word command in code', async () => {
    const files = component(
      `<div data-intent=\${i.Run} data-intent-on="keydown"></div>`,
      `subscriptions: undefined, // a command() in a comment`,
    );
    expect(await dynamicImports(files, true)).toEqual([]);
  });

  it('ignore command markup in comments', async () => {
    const files = component(button, `// data-intent-on="command", events: ['command']`);
    expect(await dynamicImports(files, true)).toEqual([]);
  });
});

/** A package in the fixture's node_modules: a function named raw, command strings and markup. */
const pkg = (name: string, deps: Record<string, string> = {}): Record<string, string> => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({
    name,
    type: 'module',
    exports: './index.js',
    dependencies: deps,
  }),
  [`node_modules/${name}/index.js`]: `
    export function raw(i) { return i; }
    export const parse = (i, options) => raw(i, options);
    export const events = ['command'];
    export const markup = '<p data-intent-on="command"></p>';
  `,
});

/** The component's app, importing `names` from `from`. */
const withImport = (names: string, from: string, use: string): Record<string, string> => ({
  'main.ts': `import { ${names} } from ${JSON.stringify(from)};\nexport const used = ${use};\n${
    component(button)['main.ts'] ?? ''
  }`,
});

describe('client-only builds: which modules may need the invoker fallback', () => {
  const shim = [expect.stringMatching(/invokers-shim/)];

  it('skip installed packages that reach no Gyral package, whatever they call raw', async () => {
    const files = { ...pkg('plain'), ...withImport('parse, events, markup', 'plain', 'parse') };
    expect(await dynamicImports(files, true)).toEqual([]);
  });

  it('scan installed packages that depend on a Gyral package', async () => {
    const files = { ...pkg('ds', { '@gyral/core': '*' }), ...withImport('events', 'ds', 'events') };
    expect(await dynamicImports(files, true)).toEqual(shim);
  });

  it("count raw only when it is Gyral's: a function of another package doesn't", async () => {
    const files = { ...pkg('plain'), ...withImport('raw', 'plain', "raw('<p></p>')") };
    expect(await dynamicImports(files, true)).toEqual([]);
    const local = component(button);
    local['main.ts'] = `const raw = (s: string) => s;\nexport const x = raw('a');\n${
      local['main.ts'] ?? ''
    }`;
    expect(await dynamicImports(local, true)).toEqual([]);
  });

  it("keep the fallback for Gyral's raw from '@gyral/core', with command markup", async () => {
    const files = withImport(
      'raw',
      '@gyral/core',
      `raw('<button data-intent-on="command" commandfor="d" command="show-modal"></button>')`,
    );
    const built = await buildApp(files, { production: true, clientOnly: true, linkCore: true });
    expect(built.chunks.flatMap((c) => c.dynamicImports)).toEqual(shim);
  });

  it('keep it for an aliased raw, a namespace read of raw, or a re-export', async () => {
    expect(await dynamicImports(withImport('raw as trusted', VIEW, "trusted('')"), true)).toEqual(
      shim,
    );
    const ns = component(button);
    ns['main.ts'] =
      `import * as view from ${JSON.stringify(VIEW)};\nexport const t = view.raw('');\n${
        ns['main.ts'] ?? ''
      }`;
    expect(await dynamicImports(ns, true)).toEqual(shim);
    const reexported = {
      ...withImport('raw', './gyral.ts', "raw('')"),
      'gyral.ts': `export { raw } from ${JSON.stringify(VIEW)};`,
    };
    expect(await dynamicImports(reexported, true)).toEqual(shim);
  });

  it('count raw re-exported by another Gyral package, not an import() of one', async () => {
    const gyralPkg = (name: string, code: string): Record<string, string> => ({
      [`node_modules/@gyral/${name}/package.json`]: JSON.stringify({
        name: `@gyral/${name}`,
        type: 'module',
        exports: './index.js',
        dependencies: { '@gyral/core': '*' },
      }),
      [`node_modules/@gyral/${name}/index.js`]: code,
    });
    // examples/shared/devtools.ts: a lazily loaded panel, which doesn't export raw.
    const lazy = {
      ...gyralPkg('panel', 'export const mount = () => 1;'),
      'main.ts': `export const panel = () => import('@gyral/panel');\n${
        component(button)['main.ts'] ?? ''
      }`,
    };
    expect(await dynamicImports(lazy, true)).toEqual([expect.stringMatching(/panel/)]);
    const reexporter = {
      ...gyralPkg('kit', `export { raw } from ${JSON.stringify(VIEW)};`),
      ...withImport('raw', '@gyral/kit', "raw('')"),
    };
    expect(await dynamicImports(reexporter, true)).toEqual(shim);
  });

  it('leave it out for a namespace import read only for other exports', async () => {
    const ns = component(button);
    ns['main.ts'] =
      `import * as view from ${JSON.stringify(VIEW)};\nexport const n = view.nothing;\n${
        ns['main.ts'] ?? ''
      }`;
    expect(await dynamicImports(ns, true)).toEqual([]);
  });
});
