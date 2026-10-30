// The preset's `gyral-compiled` resolve condition (view/01-templates.md "Compiled"): added in
// `vite build` for every environment, on top of Vite's defaults; never in serve mode (dev
// server, Vitest), which keeps the runtime path.
import { defaultClientConditions, defaultServerConditions, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { gyralVitePreset } from '../../src/vite.js';

const COMPILED_CONDITION = 'gyral-compiled';
const CLIENT_CONDITIONS = [...defaultClientConditions];
const SERVER_CONDITIONS = defaultServerConditions.filter((c) => c !== 'browser');

const conditions = async (
  command: 'build' | 'serve',
  extra: { resolve?: { conditions: string[] }; environments?: { ssr: object } } = {},
): Promise<Record<string, readonly string[]>> => {
  const config = await resolveConfig(
    { configFile: false, logLevel: 'silent', ...gyralVitePreset(), ...extra },
    command,
  );
  return Object.fromEntries(
    Object.entries(config.environments).map(([name, env]) => [name, env.resolve.conditions]),
  );
};

describe('gyral-compiled condition', () => {
  it('is added to every environment in build, keeping the defaults', async () => {
    const envs = await conditions('build', { environments: { ssr: {} } });
    expect(envs['client']).toEqual([...CLIENT_CONDITIONS, COMPILED_CONDITION]);
    expect(envs['ssr']).toEqual([...SERVER_CONDITIONS, COMPILED_CONDITION]);
  });

  it("is added to the app's own conditions once", async () => {
    const envs = await conditions('build', {
      resolve: { conditions: ['custom', COMPILED_CONDITION] },
    });
    expect(envs['client']).toEqual(['custom', COMPILED_CONDITION]);
    const own = await conditions('build', { resolve: { conditions: ['custom'] } });
    expect(own['client']).toEqual(['custom', COMPILED_CONDITION]);
  });

  it('is not added in serve mode (dev server, Vitest)', async () => {
    const envs = await conditions('serve');
    expect(envs['client']).toEqual([...CLIENT_CONDITIONS]);
    expect(envs['ssr']).toEqual([...SERVER_CONDITIONS]);
  });
});

// The dependency optimizer (gyral-3pv): Vite's resolver handles a pre-bundled package's bare
// imports, but its subpath imports (core's `#view-dev`, `#devtools`) reach rolldown's own
// resolver, which uses `optimizeDeps.rolldownOptions.resolve.conditionNames`. gyral() names the
// environment's conditions there in serve mode, so an installed core's pre-bundle gets its
// development modules (scripts/lib/dev-prebundle-fixture.mjs checks the packed core).
const optimizer = async (
  command: 'build' | 'serve',
  extra: object = {},
  options: Parameters<typeof gyralVitePreset>[0] = {},
): Promise<Record<string, readonly string[] | undefined>> => {
  const config = await resolveConfig(
    { configFile: false, logLevel: 'silent', ...gyralVitePreset(options), ...extra },
    command,
  );
  return Object.fromEntries(
    Object.entries(config.environments).map(([name, env]) => [
      name,
      env.optimizeDeps.rolldownOptions?.resolve?.conditionNames,
    ]),
  );
};

describe("the dependency optimizer's conditions", () => {
  it("are the environment's, with development, in serve mode (dev server, Vitest)", async () => {
    const envs = await optimizer('serve');
    expect(envs['client']).toEqual(['module', 'browser', 'development']);
    expect(envs['ssr']).toEqual(['module', 'node', 'development']);
  });

  it("follow the app's own resolve conditions", async () => {
    const envs = await optimizer('serve', { resolve: { conditions: ['module', 'production'] } });
    expect(envs['client']).toEqual(['module', 'production']);
  });

  it('include the client-only condition when the app is client-only', async () => {
    const envs = await optimizer('serve', {}, { clientOnly: true });
    expect(envs['client']).toEqual(['module', 'browser', 'development', 'gyral-client-only']);
  });

  it("keep the app's own conditionNames", async () => {
    const own = { rolldownOptions: { resolve: { conditionNames: ['mine'] } } };
    const envs = await optimizer('serve', { optimizeDeps: own });
    expect(envs['client']).toEqual(['mine']);
  });

  it('are left alone by `vite build`', async () => {
    const envs = await optimizer('build');
    expect(envs['client']).toBeUndefined();
  });
});
