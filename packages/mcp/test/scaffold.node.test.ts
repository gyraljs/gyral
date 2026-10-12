// scaffold_component: every variant typechecks against the real packages and imports only
// what the project has installed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkSnippet } from '../src/check.js';
import { readInstalled, UNKNOWN, withListed, type Installed } from '../src/project.js';
import { scaffold, validTag, type ScaffoldKind } from '../src/scaffold.js';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));

describe('scaffold_component', () => {
  it('rejects invalid custom element names', () => {
    expect(validTag('Counter')).toMatch(/not a valid custom element name/);
    expect(validTag('my-counter')).toBeUndefined();
  });

  // Every template must typecheck against the real packages (this package's devDependencies,
  // and the workspace root's vitest, valibot and zod). Files are checked one at a time, so
  // imports of sibling files are dropped; a test imports its component, so it is checked
  // appended to the component.
  const withoutLocalImports = (code: string): string =>
    code.replace(/^import [^\n]*'\.\/[^\n]*\n/gm, '');
  const installed = (...names: string[]): Installed => withListed(UNKNOWN, names);
  const ALL = ['@gyral/core', '@gyral/http', '@gyral/ssr', '@gyral/testing', 'vitest'];
  const variants: readonly (readonly [ScaffoldKind, string, Installed])[] = [
    ['basic', 'core only', installed('@gyral/core')],
    ['basic', 'with tests', installed(...ALL)],
    ['form', 'valibot + http', installed(...ALL, 'valibot')],
    ['form', 'zod 4 without http', installed('@gyral/core', 'zod@^4.1.0')],
    ['form', 'no schema library', installed('@gyral/core')],
    ['form-native', 'with tests', installed(...ALL)],
    ['ssr-page', 'with ssr', installed(...ALL)],
    ['ssr-page', 'nothing known', UNKNOWN],
  ];

  for (const [kind, label, deps] of variants) {
    it(`"${kind}" (${label}) typechecks, imports only installed packages and passes check_snippet`, () => {
      const { files } = scaffold('demo-widget', kind, 'A demo.', deps);
      const component = files[0]?.code ?? '';
      for (const file of files) {
        const imported = [...file.code.matchAll(/from '([^']+)'/g)].map((m) => m[1] ?? '');
        for (const specifier of imported.filter((i) => !i.startsWith('.'))) {
          const pkg = /^(@[^/]+\/[^/]+|[^/]+)/.exec(specifier)?.[1] ?? specifier;
          expect(pkg === '@gyral/core' || deps.packages.has(pkg), `${file.path}: ${pkg}`).toBe(
            true,
          );
        }
        const code = file.path.endsWith('.test.ts')
          ? `${component}\n${withoutLocalImports(file.code)}`
          : withoutLocalImports(file.code);
        expect(checkSnippet(code, pkgDir).report, `${kind}: ${file.path}`).toMatch(
          /^No type errors \(TypeScript [^)]+\) and no common Gyral mistakes found\.$/,
        );
      }
    }, 60_000);
  }

  it('emits a test file only when @gyral/testing and vitest are installed', () => {
    const paths = (deps: Installed) =>
      scaffold('my-count', 'basic', undefined, deps).files.map((f) => f.path);
    expect(paths(UNKNOWN)).toEqual(['src/my-count.ts']);
    expect(paths(installed('@gyral/testing'))).toEqual(['src/my-count.ts']);
    expect(paths(installed('@gyral/testing', 'vitest'))).toEqual([
      'src/my-count.ts',
      'src/my-count.test.ts',
    ]);
    expect(scaffold('my-count', 'basic').notes.join('\n')).toContain('no package.json was found');
  });

  it('picks the form for the installed packages', () => {
    const code = (deps: Installed) =>
      scaffold('my-form', 'form', undefined, deps).files[0]?.code ?? '';
    const native = code(UNKNOWN);
    expect(native).toContain('novalidate');
    expect(native).toContain('control.validity');
    expect(native).toContain('focus(`#${first}`)');
    expect(native).not.toMatch(/from '(?:valibot|zod|@gyral\/http)'/);
    expect(code(installed('valibot', '@gyral/http'))).toContain("submitForm<Msg>('/my-form'");
    expect(code(installed('valibot'))).not.toContain("from '@gyral/http'");
    expect(code(installed('zod@^4.0.0'))).toContain("import { z } from 'zod';");
    // zod 3 has no z.email(): the dependency-free form instead.
    expect(code(installed('zod@^3.23.0'))).toContain('novalidate');
    expect(
      scaffold('my-page', 'ssr-page', undefined, installed('@gyral/core')).files.map((f) => f.path),
    ).toEqual(['src/my-page.ts', 'src/entry-client.ts']);
  });

  describe('reading package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-mcp-project-'));
    afterAll(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('reads every dependency field, from the nearest package.json up', () => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'app',
          dependencies: { '@gyral/core': '^0.3.1', zod: '^4.1.0' },
          devDependencies: { vitest: '^5.0.0', '@gyral/testing': '^0.3.1' },
        }),
      );
      mkdirSync(join(dir, 'src', 'deep'), { recursive: true });
      const found = readInstalled(join(dir, 'src', 'deep'));
      expect(found.known).toBe(true);
      expect([...found.packages.keys()].sort()).toEqual(
        ['@gyral/core', '@gyral/testing', 'app', 'vitest', 'zod'].sort(),
      );
      const { files } = scaffold('my-form', 'form', undefined, found);
      expect(files[0]?.code).toContain("from 'zod'");
    });

    it('falls back to nothing known on unreadable JSON', () => {
      const broken = join(dir, 'broken');
      mkdirSync(broken);
      writeFileSync(join(broken, 'package.json'), '{ not json');
      expect(readInstalled(broken)).toBe(UNKNOWN);
      expect(withListed(UNKNOWN, ['@gyral/ssr@0.3.1']).packages.get('@gyral/ssr')).toBe('0.3.1');
    });
  });
});
