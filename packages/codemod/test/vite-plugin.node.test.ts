/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { expectUnchanged, migrate, source } from './helpers.js';

const file = 'vite.config.ts';

describe('vite-plugin: rewrites', () => {
  it('defineConfig(gyralVitePreset(o)) → defineConfig({ plugins: [gyral(o)] })', () => {
    const { code, findings } = migrate(
      source`
        import { defineConfig } from 'vite';
        import { gyralVitePreset } from '@gyral/core/vite';

        export default defineConfig(gyralVitePreset({ components: true }));
      `,
      file,
    );
    expect(code).toBe(source`
      import { defineConfig } from 'vite';
      import { gyral } from '@gyral/core/vite';

      export default defineConfig({ plugins: [gyral({ components: true })] });
    `);
    expect(findings).toEqual([]);
  });

  it('a spread in an object without plugins becomes plugins: [gyral(o)]', () => {
    const { code } = migrate(
      source`
        import { defineConfig } from 'vitest/config';
        import { gyralVitePreset } from '@gyral/core/vite';

        export default defineConfig({
          ...gyralVitePreset(),
          build: { target: 'es2023' },
          test: { projects: [{ ...gyralVitePreset({ clientOnly: true }), test: { name: 'b' } }] },
        });
      `,
      file,
    );
    expect(code).toBe(source`
      import { defineConfig } from 'vitest/config';
      import { gyral } from '@gyral/core/vite';

      export default defineConfig({
        plugins: [gyral()],
        build: { target: 'es2023' },
        test: { projects: [{ plugins: [gyral({ clientOnly: true })], test: { name: 'b' } }] },
      });
    `);
  });

  it('gyralVitePreset(o).plugins → gyral(o), with an aliased import', () => {
    const { code } = migrate(
      source`
        import { gyralVitePreset as preset } from '@gyral/core/vite';
        import mine from './mine.js';

        export default { plugins: [...preset({ clientOnly: true }).plugins, mine()] };
        export const other = { plugins: preset().plugins };
      `,
      file,
    );
    expect(code).toBe(source`
      import { gyral } from '@gyral/core/vite';
      import mine from './mine.js';

      export default { plugins: [...gyral({ clientOnly: true }), mine()] };
      export const other = { plugins: gyral() };
    `);
  });

  // gyral-68h (gathered-wishes): gyral() always returns an array, so a fallback for the preset's
  // plugins is dead, and the parentheses it needed go with it.
  it('drops a ?? [] or || [] fallback after gyralVitePreset(o).plugins', () => {
    const { code, findings } = migrate(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';
        import mine from './mine.js';

        export default { plugins: [...(gyralVitePreset().plugins ?? []), mine()] };
        export const other = { plugins: gyralVitePreset({ clientOnly: true }).plugins || [] };
        export const typed = { plugins: [...( gyralVitePreset().plugins ?? ([] as Plugin[]) )] };
      `,
      file,
    );
    expect(code).toBe(source`
      import { gyral } from '@gyral/core/vite';
      import mine from './mine.js';

      export default { plugins: [...gyral(), mine()] };
      export const other = { plugins: gyral({ clientOnly: true }) };
      export const typed = { plugins: [...gyral()] };
    `);
    expect(findings).toEqual([]);
  });

  it('keeps a fallback that is not an empty array, and parentheses a comment sits in', () => {
    const { code } = migrate(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';

        export default { plugins: [...(gyralVitePreset().plugins ?? defaults), ...(gyralVitePreset().plugins ?? [] /* none */)] };
      `,
      file,
    );
    expect(code).toBe(source`
      import { gyral } from '@gyral/core/vite';

      export default { plugins: [...(gyral() ?? defaults), ...(gyral() /* none */)] };
    `);
  });

  it('inlines const p = gyralVitePreset(o) into ...p.plugins and drops ...p.optimizeDeps', () => {
    const { code, findings } = migrate(
      source`
        import { defineConfig } from 'vite';
        import { gyralVitePreset } from '@gyral/core/vite';
        import mine from './mine.js';

        const preset = gyralVitePreset({ optimize: ['nanoid'], compiler: { strict: process.env.CI === 'true' } });

        export default defineConfig({
          plugins: [...preset.plugins, mine()],
          optimizeDeps: { ...preset.optimizeDeps, exclude: ['fsevents'] },
        });
      `,
      file,
    );
    expect(code).toBe(source`
      import { defineConfig } from 'vite';
      import { gyral } from '@gyral/core/vite';
      import mine from './mine.js';

      export default defineConfig({
        plugins: [gyral({ optimize: ['nanoid'], compiler: { strict: process.env.CI === 'true' } }), mine()],
        optimizeDeps: { exclude: ['fsevents'] },
      });
    `);
    expect(findings).toEqual([]);
  });

  it("drops an optimizeDeps that is only the preset's", () => {
    const { code } = migrate(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';

        export default ({ mode }: { mode: string }) => {
          const preset = gyralVitePreset({ clientOnly: mode === 'spa' });
          return {
            plugins: [...preset.plugins],
            optimizeDeps: { ...preset.optimizeDeps },
            build: { sourcemap: true },
          };
        };
        const p2 = gyralVitePreset();
        export const two = { optimizeDeps: p2.optimizeDeps, plugins: [...p2.plugins] };
      `,
      file,
    );
    expect(code).toBe(source`
      import { gyral } from '@gyral/core/vite';

      export default ({ mode }: { mode: string }) => {
        return {
          plugins: [gyral({ clientOnly: mode === 'spa' })],
          build: { sourcemap: true },
        };
      };
      export const two = { plugins: [gyral()] };
    `);
  });

  it('keeps gyralVitePreset in the import while a use remains, and reuses an existing gyral import', () => {
    const mixed = migrate(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';

        export const a = { ...gyralVitePreset() };
        export const b = mergeConfig(gyralVitePreset(), {});
      `,
      file,
    );
    expect(mixed.code).toContain("import { gyral, gyralVitePreset } from '@gyral/core/vite';");
    expect(mixed.code).toContain('export const a = { plugins: [gyral()] };');
    expect(mixed.findings).toEqual([
      "4 [vite-plugin] gyralVitePreset(…) left as is: its result is used in a way this codemod doesn't rewrite; use plugins: [gyral(…)] by hand",
    ]);

    const existing = migrate(
      source`
        import { gyral as g, gyralVitePreset } from '@gyral/core/vite';

        export default { ...gyralVitePreset(), base: '/' };
      `,
      file,
    );
    expect(existing.code).toBe(source`
      import { gyral as g } from '@gyral/core/vite';

      export default { plugins: [g()], base: '/' };
    `);
  });
});

describe('vite-plugin: left as is, and reported', () => {
  it('a preset whose result is used elsewhere', () => {
    const findings = expectUnchanged(
      source`
        import { defineConfig } from 'vite';
        import { gyralVitePreset } from '@gyral/core/vite';

        const preset = gyralVitePreset();
        console.log(preset.plugins.length);

        export default defineConfig({ plugins: [...preset.plugins] });
      `,
      file,
    );
    expect(findings).toEqual([
      '4 [vite-plugin] `preset = gyralVitePreset(…)` left as is: `preset` has another use (line 5)',
    ]);
  });

  it('an object with its own plugins, or an optimizeDeps the spread overrides', () => {
    const findings = expectUnchanged(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';

        export const a = { ...gyralVitePreset(), plugins: [mine()] };
        export const b = { optimizeDeps: { include: ['x'] }, ...gyralVitePreset() };
      `,
      file,
    );
    expect(findings).toEqual([
      '3 [vite-plugin] gyralVitePreset(…) left as is: the object has its own `plugins`; put gyral(…) in that list by hand',
      "4 [vite-plugin] gyralVitePreset(…) left as is: `optimizeDeps` before it loses its optimizeDeps to the preset today, and wouldn't with gyral(); rewrite it by hand",
    ]);
  });

  it("options that can't move, and optimizeDeps that depend on the preset's", () => {
    const findings = expectUnchanged(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';

        const a = gyralVitePreset({ optimize: list() });
        export const one = { plugins: [...a.plugins] };
        const b = gyralVitePreset();
        export const two = { plugins: [...b.plugins], optimizeDeps: { include: ['x'], ...b.optimizeDeps } };
        const c = gyralVitePreset();
        export const three = { plugins: [...c.plugins], optimizeDeps: { ...c.optimizeDeps, include: ['@gyral/router'] } };
        export const p = gyralVitePreset();
      `,
      file,
    );
    expect(findings).toEqual([
      '3 [vite-plugin] `a = gyralVitePreset(…)` left as is: its options run code (line 3); inline them by hand',
      '5 [vite-plugin] `b = gyralVitePreset(…)` left as is: an `include` before `...b.optimizeDeps` is replaced by it today',
      '7 [vite-plugin] `c = gyralVitePreset(…)` left as is: its optimizeDeps names Gyral packages, which gyral() pre-bundles itself; review it by hand',
      '9 [vite-plugin] `p = gyralVitePreset(…)` left as is: it is exported',
    ]);
  });

  it('options that read a local object something could change before the plugins are used', () => {
    const findings = expectUnchanged(
      source`
        import { defineConfig } from 'vite';
        import { gyralVitePreset } from '@gyral/core/vite';

        const opts = { clientOnly: true };
        const a = gyralVitePreset(opts);
        opts.clientOnly = false;
        export const one = { plugins: [...a.plugins] };
        const b = gyralVitePreset(opts);
        export const two = defineConfig(() => ({ plugins: [...b.plugins] }));
        const c = gyralVitePreset(opts);
        export const three = { build: tweak(opts), plugins: [...c.plugins] };
      `,
      file,
    );
    expect(findings).toEqual([
      '5 [vite-plugin] `a = gyralVitePreset(…)` left as is: its options read `opts`, and line 6 runs before its plugins are used and could change it; inline them by hand',
      '8 [vite-plugin] `b = gyralVitePreset(…)` left as is: its options read `opts`, and its plugins are used inside a function that runs later; inline them by hand',
      '10 [vite-plugin] `c = gyralVitePreset(…)` left as is: its options read `opts`, and line 11 runs before its plugins are used and could change it; inline them by hand',
    ]);
  });

  it('moves options that read a local when nothing runs in between, and literals anywhere', () => {
    const { code } = migrate(
      source`
        import { defineConfig } from 'vite';
        import { gyralVitePreset } from '@gyral/core/vite';

        const opts = { clientOnly: true };
        const a = gyralVitePreset(opts);
        const root = 'src';
        export const one = { root, plugins: [...a.plugins] };
        const b = gyralVitePreset({ components: true });
        setup();
        export default defineConfig(() => ({ plugins: [...b.plugins] }));
      `,
      file,
    );
    expect(code).toBe(source`
      import { defineConfig } from 'vite';
      import { gyral } from '@gyral/core/vite';

      const opts = { clientOnly: true };
      const root = 'src';
      export const one = { root, plugins: [gyral(opts)] };
      setup();
      export default defineConfig(() => ({ plugins: [gyral({ components: true })] }));
    `);
  });

  it('a file that already declares gyral', () => {
    const findings = expectUnchanged(
      source`
        import { gyralVitePreset } from '@gyral/core/vite';

        const gyral = 'name';
        export default { ...gyralVitePreset() };
      `,
      file,
    );
    expect(findings).toEqual([
      '4 [vite-plugin] gyralVitePreset left as is: `gyral` is already declared in this file; rename it, then run again',
    ]);
  });

  it('a gyralVitePreset that is not @gyral/core/vite’s', () => {
    expect(
      expectUnchanged(
        source`
          import { gyralVitePreset } from './my-preset.js';

          export default { ...gyralVitePreset() };
        `,
        file,
      ),
    ).toEqual([]);
  });
});
