// Starting code for a new component, following the skill's golden rules: tagged messages, pure
// update, views that name intents, effects as commands, tests without a DOM. The test suite
// typechecks every template against the real packages.

export type ScaffoldKind = 'basic' | 'form' | 'ssr-page';

export interface ScaffoldFile {
  readonly path: string;
  readonly code: string;
}

export interface Scaffold {
  readonly files: readonly ScaffoldFile[];
  readonly notes: readonly string[];
}

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

const comment = (description: string | undefined): string =>
  description === undefined || description.trim() === ''
    ? ''
    : `${description
        .trim()
        .split('\n')
        .map((line) => `// ${line}`)
        .join('\n')}\n`;

function basic(tag: string, name: string, description: string | undefined): Scaffold {
  const component = `${comment(description)}import { css, define, html } from '@gyral/core';

export interface State {
  readonly count: number;
}

export type Msg = { readonly _tag: 'Increment' } | { readonly _tag: 'Reset' };

export const ${name} = define<State, Msg>('${tag}', {
  init: () => ({ count: 0 }),
  // Intent: parse platform events into typed messages (button → click by default).
  intent: {
    Increment: () => ({ _tag: 'Increment' }),
    Reset: () => ({ _tag: 'Reset' }),
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
  return {
    files: [
      { path: `src/${tag}.ts`, code: component },
      { path: `src/${tag}.test.ts`, code: test },
    ],
    notes: [
      `Import it once for its side effect (it registers <${tag}>), then use <${tag}></${tag}> in markup.`,
      'Add messages to Msg first; TypeScript then requires an intent (if user-triggered) and a reducer for each.',
    ],
  };
}

function form(tag: string, name: string, description: string | undefined): Scaffold {
  const component = `${comment(description)}import { define, defineForm, fieldErrors, form, html, invalid, nothing, type FormFields } from '@gyral/core';
import { submitForm } from '@gyral/http';
import * as v from 'valibot';

// One schema for both sides: the browser validates on submit, the server (formAction) again.
export const ${name}Form = defineForm(
  v.object({
    name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter your name.')),
    email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address.')),
  }),
);

export interface State {
  readonly values: FormFields;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly done: boolean;
}

export type Msg =
  | { readonly _tag: 'Submit'; readonly form: FormData }
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed' };

const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

const FIELDS = [
  { name: 'name', label: 'Name', type: 'text', autocomplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
] as const;

export const ${name} = define<State, Msg>('${tag}', {
  init: () => ({ values: {}, errors: {}, done: false }),
  intent: {
    // Invalid submissions never become Submit: they arrive as IntentRejected.
    Submit: form(${name}Form, (_data, raw) => ({ _tag: 'Submit', form: raw })),
  },
  update: {
    Submit: (s, m) => [
      { ...s, errors: {} },
      [
        submitForm<Msg>('/${tag}', m.form, {
          onSuccess: () => ({ _tag: 'Done' }),
          onFailure: () => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    Done: (s) => ({ ...s, done: true }),
    Failed: (s) => ({ ...s, errors: { '': ['Something went wrong. Try again.'] } }),
    // Client-side and server-side (422) rejections arrive the same way.
    IntentRejected: (s, m) => ({ ...s, values: m.values ?? s.values, errors: fieldErrors(m.issues) }),
  },
  view: (s, i) =>
    s.done
      ? html\`<p role="status">Thanks, we got it.</p>\`
      : html\`<form data-intent=\${i.Submit} action="/${tag}" method="post">
          \${FIELDS.map((f) => {
            const errors = s.errors[f.name];
            return html\`<p>
              <label for=\${f.name}>\${f.label}</label>
              <input
                id=\${f.name}
                name=\${f.name}
                type=\${f.type}
                autocomplete=\${f.autocomplete}
                required
                value=\${text(s.values, f.name)}
                aria-describedby=\${\`\${f.name}-error\`}
                aria-invalid=\${errors === undefined ? nothing : 'true'}
                \${invalid(errors)}
              />
              <span id=\${\`\${f.name}-error\`}>\${errors?.join(' ') ?? ''}</span>
            </p>\`;
          })}
          <p role="alert">\${s.errors['']?.join(' ') ?? ''}</p>
          <button>Send</button>
        </form>\`,
});
`;
  return {
    files: [{ path: `src/${tag}.ts`, code: component }],
    notes: [
      'Needs: npm i @gyral/core @gyral/http lit valibot (any Standard Schema library works).',
      `The form posts to /${tag}: handle it on the server with formAction(${name}Form, …) from @gyral/ssr so it also works without JavaScript (get_doc "forms#the-server-half").`,
      'Never keep passwords in state or re-fill them from values: state is serialized into the page.',
    ],
  };
}

function ssrPage(tag: string, name: string, description: string | undefined): Scaffold {
  const page = `${comment(description)}import { define, html, type Stateless } from '@gyral/core';

// Page-level content uses light DOM: crawlers and document CSS see plain children.
export const ${name} = define<Stateless, never>('${tag}', {
  shadow: false,
  intent: {},
  update: {},
  view: () => html\`
    <h1>${name}</h1>
    <p>Rendered on the server, hydrated in place. Put interactive widgets inside as their own components.</p>
  \`,
});
`;
  const route = `import { html } from 'lit';
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
  const entry = `// Client entry. ORDER MATTERS: hydrate support before anything that imports lit or @gyral/core.
import '@gyral/ssr/hydrate';
import './${tag}.js';
`;
  return {
    files: [
      { path: `src/${tag}.ts`, code: page },
      { path: `server/${tag}-route.ts`, code: route },
      { path: 'src/entry-client.ts', code: entry },
    ],
    notes: [
      'Needs: npm i @gyral/core @gyral/ssr lit @lit-labs/ssr @lit-labs/ssr-client.',
      'Mount the route in any server that speaks Request/Response (Hono, Node via productionServer, Workers), or prerender it with @gyral/ssr/static.',
      'Or start from a working app: npm create gyral@latest my-app -- --template ssr.',
    ],
  };
}

export function scaffold(tag: string, kind: ScaffoldKind, description?: string): Scaffold {
  const name = pascal(tag);
  switch (kind) {
    case 'basic':
      return basic(tag, name, description);
    case 'form':
      return form(tag, name, description);
    case 'ssr-page':
      return ssrPage(tag, name, description);
  }
}
