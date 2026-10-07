// Client-only builds (gyralVitePreset({ clientOnly: true }), view/07-hydration.md "Client-only
// builds", gyral-c5d.11): the browser bundle has no hydration code, and the invoker-command
// fallback's import() only when a module may make a root listen for `command`
// (compiler/features.ts). Without the option nothing changes.
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_CONDITIONS,
  CLIENT_ONLY_CONDITION,
  COMPILED_CONDITION,
  gyralVitePreset,
  SERVER_CONDITIONS,
} from '../../src/vite.js';
import { buildApp, CORE, VIEW } from './fixture.js';

/** A component whose view is `markup` (an html template body) and whose spec adds `extra`. */
const component = (markup: string, extra = ''): Record<string, string> => ({
  'main.ts': `
    import { define } from ${JSON.stringify(CORE)};
    import { html } from ${JSON.stringify(VIEW)};
    export const C = define('x-c', {
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
});
