// Starting code for a new component, following the skill's golden rules: tagged messages, pure
// update, views that name intents, effects as commands, tests without a DOM. A scaffold imports
// only packages the target project has installed (project.ts): with none known, only
// @gyral/core. The test suite typechecks every variant against the real packages.
import { has, UNKNOWN, type Installed } from './project.js';
import { canTest, comment, testNote, type Scaffold } from './scaffold-common.js';
import { nativeForm, schemaForm, schemaLibrary } from './scaffold-forms.js';

export type { Scaffold, ScaffoldFile } from './scaffold-common.js';

export type ScaffoldKind = 'basic' | 'form' | 'form-native' | 'ssr-page';

/** Custom element names: lowercase, start with a letter, contain a hyphen. */
export function validTag(tag: string): string | undefined {
  if (!/^[a-z][a-z0-9._]*(-[a-z0-9._]*)+$/.test(tag)) {
    return `"${tag}" is not a valid custom element name: use lowercase letters, digits and at least one hyphen, starting with a letter (e.g. "my-counter").`;
  }
  return undefined;
}

const pascal = (tag: string): string =>
  tag
    .split(/[-._]/)
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

function basic(tag: string, name: string, description: string | undefined, installed: Installed) {
  const component = `${comment(description)}import { css, define, html } from '@gyral/core';

export interface State {
  readonly count: number;
}

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Reset' };

export const ${name} = define<State, Msg>()('${tag}', {
  init: () => ({ count: 0 }),
  // Intent: parse platform events into typed messages (button → click by default).
  intent: {
    Increment: true,
    Reset: true,
  },
  // Model: one pure reducer per message. Return [state, [command]] for side effects.
  update: {
    Increment: (s) => ({ count: s.count + 1 }),
    Reset: () => ({ count: 0 }),
  },
  // View: a pure function of state that names intents; no event handlers.
  view: (s, i) => html\`
    <p>Count: <output aria-live="polite">\${s.count}</output></p>
    <button type="button" data-intent=\${i.Increment}>Add one</button>
    <button type="button" data-intent=\${i.Reset} ?disabled=\${s.count === 0}>Reset</button>
  \`,
  styles: css\`
    :host {
      display: block;
    }
  \`,
});
`;
  const test = `import { describe, expect, it } from 'vitest';
import { initial, run } from '@gyral/testing';
import { ${name} } from './${tag}.js';

describe('${tag} model', () => {
  it('starts at zero', () => {
    expect(initial(${name}.spec).state).toEqual({ count: 0 });
  });

  it('counts and resets', () => {
    const { state } = run(${name}.spec, [{ _tag: 'Increment' }, { _tag: 'Increment' }]);
    expect(state.count).toBe(2);
    expect(run(${name}.spec, [{ _tag: 'Increment' }, { _tag: 'Reset' }]).state.count).toBe(0);
  });
});
`;
  const tested = canTest(installed);
  return {
    files: [
      { path: `src/${tag}.ts`, code: component },
      ...(tested ? [{ path: `src/${tag}.test.ts`, code: test }] : []),
    ],
    notes: [
      `Import it once for its side effect (it registers <${tag}>), then use <${tag}></${tag}> in markup.`,
      'Add messages to Msg first; TypeScript then requires an intent (if user-triggered) and a reducer for each.',
      ...(tested ? [] : [testNote(installed)]),
    ],
  };
}

function ssrPage(tag: string, name: string, description: string | undefined, installed: Installed) {
  const page = `${comment(description)}import { define, html, type Stateless } from '@gyral/core';

// Page-level content uses light DOM: crawlers and document CSS see plain children.
export const ${name} = define<Stateless, never>()('${tag}', {
  shadow: false,
  view: () => html\`
    <h1>${name}</h1>
    <p>Rendered on the server, hydrated in place. Put interactive widgets inside as their own components.</p>
  \`,
});
`;
  const route = `import { html } from '@gyral/core';
import { renderPage } from '@gyral/ssr';
import './${tag}.js';

/** GET handler: a full HTML page with <${tag}> rendered on the server. */
export function ${name.charAt(0).toLowerCase()}${name.slice(1)}Route(_request: Request, clientEntry: string): Response {
  return renderPage({
    title: '${name}',
    description: 'Describe this page for search results.',
    lang: 'en',
    body: html\`<${tag}></${tag}>\`,
    scripts: [clientEntry],
  });
}
`;
  const entry = `// Client entry: import the components. Hydration is built into @gyral/core.
import './${tag}.js';
`;
  const ssr = has(installed, '@gyral/ssr');
  return {
    files: [
      { path: `src/${tag}.ts`, code: page },
      ...(ssr ? [{ path: `server/${tag}-route.ts`, code: route }] : []),
      { path: 'src/entry-client.ts', code: entry },
    ],
    notes: [
      ...(ssr
        ? []
        : [
            installed.known
              ? 'No server route: the project lacks @gyral/ssr. npm i @gyral/ssr, then scaffold again for a renderPage() route.'
              : 'No server route: no package.json was found, so only @gyral/core is assumed. Pass project_dir (or installed with "@gyral/ssr") for a renderPage() route.',
          ]),
      'Hydration is built into @gyral/core: the client entry only imports the components.',
      'Mount the route in any server that speaks Request/Response (Hono, Node via productionServer, Workers), or prerender it with @gyral/ssr/static.',
      'In production, pass clientAssetsFromManifest() results as renderPage({ scripts: [entry], modulepreload }) so the page preloads the hydration chunk.',
      'Or start from a working app: npm create gyral@latest my-app -- --template ssr.',
    ],
  };
}

/**
 * Starting code of `kind` for `<tag>`. `form` uses a schema library and @gyral/http when the
 * project has them, else the dependency-free form (`form-native`).
 */
export function scaffold(
  tag: string,
  kind: ScaffoldKind,
  description?: string,
  installed: Installed = UNKNOWN,
): Scaffold {
  const name = pascal(tag);
  const result = ((): Scaffold => {
    switch (kind) {
      case 'basic':
        return basic(tag, name, description, installed);
      case 'form': {
        const library = schemaLibrary(installed);
        if (library !== undefined)
          return schemaForm(tag, name, description, library, has(installed, '@gyral/http'));
        const native = nativeForm(tag, name, description, installed);
        return {
          ...native,
          notes: [
            installed.known
              ? 'No schema library (valibot, zod 4) in the project, so this is the dependency-free form. With one installed, kind "form" shares a schema with the server (formAction).'
              : 'No package.json was found, so this is the dependency-free form. Pass project_dir (or installed) for the schema form when valibot or zod is installed.',
            ...native.notes,
          ],
        };
      }
      case 'form-native':
        return nativeForm(tag, name, description, installed);
      case 'ssr-page':
        return ssrPage(tag, name, description, installed);
    }
  })();
  const core =
    installed.known && !has(installed, '@gyral/core')
      ? ['The project has no @gyral/core yet: npm i @gyral/core.']
      : [];
  const source = installed.known ? [`Installed packages read from ${installed.source}.`] : [];
  return { files: result.files, notes: [...core, ...result.notes, ...source] };
}
