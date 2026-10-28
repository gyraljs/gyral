// A published component library ships its templates compiled, so an app's build-time feature
// scan (src/compiler/features.ts) must recognize what they bind in compiled form too, or the
// `gyral-compiled` runtime leaves the machinery out and the binding silently does nothing in
// production (gyral-k97.1: library dialogs never opened in a consumer's production build).
import { chromium } from 'playwright';
import { parseSync } from 'vite';
import { expect, it } from 'vitest';
import type { Node } from '../../src/compiler/ast.js';
import { factsOf, writes } from '../../src/compiler/facts.js';
import { createFeatures } from '../../src/compiler/features.js';
import { buildApp } from './fixture.js';

it.each([
  ['a client ?modal part', 'const t = { parts: [[5, [0, 1], "modal"]] };', 'dialogs'],
  ['an SSR ?popover-open segment', 'const t = {"k":"bool","name":"popover-open"};', 'dialogs'],
  [
    'a client bound data-intent-on',
    'const t = { parts: [[4, 0, "data-intent-on", []]] };',
    'invokers',
  ],
  ['an SSR one, minified', 'const t={k:"attr",name:"data-intent-on"};', 'invokers'],
] as const)(
  "the text fallback, for a module that doesn't parse, sees %s",
  async (_n, code, feature) => {
    const features = createFeatures([feature], '/core/src/view/compiled.ts');
    const unparsable = {
      parse: () => {
        throw new SyntaxError('unparsable');
      },
      resolve: () => Promise.resolve(null),
    };
    expect(await features.inject(code, '/app/src/lib.js', unparsable)).toContain(
      `virtual:gyral-use/${feature}`,
    );
  },
);

const LIBRARY = `
import { define, html } from '@gyral/core';
export const Menu = define()('lib-menu', {
  init: () => ({ open: false }),
  intent: { Open: true, Close: true },
  update: { Open: (s) => ({ ...s, open: true }), Close: (s) => ({ ...s, open: false }) },
  view: (s, i) => html\`<button type="button" data-intent=\${i.Open}>Menu</button>
    <dialog ?modal=\${s.open} aria-label="Menu">
      <button type="button" data-intent=\${i.Close}>Close</button>
    </dialog>\`,
});
`;

/** A library build leaves core to the app that installs it. */
const CORE_IMPORTS = [/^@gyral\/core(\/.*)?$/];

const buildLibrary = async (options: { ssr?: boolean; minify?: boolean }): Promise<string> => {
  const built = await buildApp(
    { 'index.ts': LIBRARY },
    { entry: 'index.ts', linkCore: true, production: true, external: CORE_IMPORTS, ...options },
  );
  return built.code;
};

it.each([
  ['for the client', {}],
  ['for the server', { ssr: true }],
  ['and minified', { minify: true }],
])(
  'the scan sees ?modal in a library compiled %s',
  async (_name, options) => {
    const code = await buildLibrary(options);
    expect(code).not.toContain('?modal');
    const facts = factsOf(parseSync('index.js', code).program as unknown as Node);
    expect(writes(facts, 'dialogs')).toBe(true);
  },
  30_000,
);

/**
 * Installs the library (built for the server, as joystyk-libraries publish) in an app, builds the
 * app for production, clicks the library's Menu button and reports what the page saw.
 */
async function clickMenu(
  dependencies: Readonly<Record<string, string>>,
): Promise<{ opened: boolean; warnings: string[]; failures: string[] }> {
  const library = await buildLibrary({ ssr: true });
  const built = await buildApp(
    {
      'main.ts': "import { Menu } from 'lib-menu';\ndocument.body.append(new Menu());\n",
      'node_modules/lib-menu/package.json': JSON.stringify({
        name: 'lib-menu',
        type: 'module',
        exports: './index.js',
        dependencies,
      }),
      'node_modules/lib-menu/index.js': library,
    },
    { production: true, clientOnly: true, linkCore: true },
  );
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const warnings: string[] = [];
    const failures: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });
    page.on('pageerror', (error) => {
      failures.push(error.message);
    });
    await page.setContent('<!doctype html><html lang="en"><title>Library</title><body></body>');
    await page.addScriptTag({ type: 'module', content: built.code });
    const menu = page.locator('lib-menu');
    await menu.getByRole('button', { name: 'Menu' }).click();
    const opened = await menu
      .locator('dialog:modal')
      .waitFor({ timeout: 3_000 })
      .then(
        () => true,
        () => false,
      );
    return { opened, warnings, failures };
  } finally {
    await browser.close();
  }
}

it("opens an installed library's dialog in the app's production build", async () => {
  const seen = await clickMenu({ '@gyral/core': '*' });
  expect(seen).toEqual({ opened: true, warnings: [], failures: [] });
}, 60_000);

it('warns in production when a binding runs without its code (a package not scanned)', async () => {
  // A package that doesn't depend on Gyral is out of the scan's scope (scope.ts).
  const seen = await clickMenu({});
  expect(seen.opened).toBe(false);
  // Once per change of the bound value: the first render (closed), then the click (open).
  expect(seen.warnings).toEqual([
    'Gyral G0069 dialog modal https://gyral.dev/errors/#G0069',
    'Gyral G0069 dialog modal https://gyral.dev/errors/#G0069',
  ]);
  expect(seen.failures).toEqual([]);
}, 60_000);
