// The preset's `gyral-compiled` resolve condition (view/01-templates.md "Compiled"): added in
// `vite build` for every environment, on top of Vite's defaults; never in serve mode (dev
// server, Vitest), which keeps the runtime path.
import { defaultClientConditions, defaultServerConditions, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_CONDITIONS,
  COMPILED_CONDITION,
  gyralVitePreset,
  SERVER_CONDITIONS,
} from '../../src/vite.js';

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
  it("mirrors Vite's default conditions", () => {
    expect(CLIENT_CONDITIONS).toEqual([...defaultClientConditions]);
    expect(SERVER_CONDITIONS).toEqual(defaultServerConditions.filter((c) => c !== 'browser'));
  });

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
