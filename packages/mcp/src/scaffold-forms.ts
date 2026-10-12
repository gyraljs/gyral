// The form scaffolds: form() with a schema library, or the dependency-free native form.
import { has, major, type Installed } from './project.js';
import { canTest, comment, testNote } from './scaffold-common.js';

/** The form's fields, shared by the schema and native variants. */
const FIELDS = `const FIELDS = [
  { name: 'name', label: 'Name', type: 'text', autocomplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
] as const;`;

const TEXT = `const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};`;

/** One labelled input per field, with its error text and native validity (`invalid()`). */
const INPUTS = `\${FIELDS.map((f) => {
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
                \${invalid(errors)}
              />
              <span id=\${\`\${f.name}-error\`}>\${errors?.join(' ') ?? ''}</span>
            </p>\`;
          })}`;

export type SchemaLibrary = 'valibot' | 'zod';

/** A Standard Schema library the scaffold can write for: valibot, or zod 4 (`z.email()`). */
export function schemaLibrary(installed: Installed): SchemaLibrary | undefined {
  if (has(installed, 'valibot')) return 'valibot';
  const zod = major(installed, 'zod');
  if (has(installed, 'zod') && (zod === undefined || zod >= 4)) return 'zod';
  return undefined;
}

const SCHEMAS: Readonly<Record<SchemaLibrary, { import: string; schema: string }>> = {
  valibot: {
    import: "import * as v from 'valibot';",
    schema: `v.object({
    name: v.pipe(v.string(), v.trim(), v.nonEmpty('Enter your name.')),
    email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address.')),
  })`,
  },
  zod: {
    import: "import { z } from 'zod';",
    schema: `z.object({
    name: z.string().trim().min(1, 'Enter your name.'),
    email: z.email('Enter a valid email address.'),
  })`,
  },
};

/** `form()` with a schema: the same definition validates on the server (formAction). */
export function schemaForm(
  tag: string,
  name: string,
  description: string | undefined,
  library: SchemaLibrary,
  http: boolean,
) {
  const { import: schemaImport, schema } = SCHEMAS[library];
  const msg = http
    ? `export type Msg =
  | { readonly _tag: 'Submit'; readonly form: FormData }
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed' };`
    : `export type Msg = { readonly _tag: 'Submit'; readonly form: FormData };`;
  const update = http
    ? `Submit: (s, m) => [
      { ...s, errors: {} },
      [
        submitForm<Msg>('/${tag}', m.form, {
          onSuccess: () => ({ _tag: 'Done' }),
          onFailure: () => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    Done: (s) => ({ ...s, done: true }),
    Failed: (s) => ({ ...s, errors: { '': ['Something went wrong. Try again.'] } }),`
    : `// Valid: send m.form with a command here (submitForm from @gyral/http, or your own driver).
    Submit: (s) => ({ ...s, errors: {}, done: true }),`;
  const component = `${comment(description)}import { define, defineForm, fieldErrors, form, html, invalid, type FormFields } from '@gyral/core';
${http ? "import { submitForm } from '@gyral/http';\n" : ''}${schemaImport}

// One schema for both sides: the browser validates on submit, the server (formAction) again.
export const ${name}Form = defineForm(
  ${schema},
);

export interface State {
  readonly values: FormFields;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly done: boolean;
}

${msg}

${TEXT}

${FIELDS}

export const ${name} = define<State, Msg>()('${tag}', {
  init: () => ({ values: {}, errors: {}, done: false }),
  intent: {
    // Invalid submissions never become Submit: they arrive as IntentRejected.
    Submit: form(${name}Form, (_data, raw) => ({ _tag: 'Submit', form: raw })),
  },
  update: {
    ${update}
    // Client-side and server-side (422) rejections arrive the same way.
    IntentRejected: (s, m) => ({ ...s, values: m.values ?? s.values, errors: fieldErrors(m.issues) }),
  },
  view: (s, i) =>
    s.done
      ? html\`<p role="status">Thanks, we got it.</p>\`
      : html\`<form data-intent=\${i.Submit} action="/${tag}" method="post">
          ${INPUTS}
          <p role="alert">\${s.errors['']?.join(' ') ?? ''}</p>
          <button>Send</button>
        </form>\`,
});
`;
  return {
    files: [{ path: `src/${tag}.ts`, code: component }],
    notes: [
      `Uses ${library} (any Standard Schema library works)${http ? ' and submitForm from @gyral/http' : ''}.`,
      ...(http
        ? []
        : [
            'Without @gyral/http the Submit reducer only marks the form done: add a command to send it (npm i @gyral/http for submitForm).',
          ]),
      `The form posts to /${tag}: handle it on the server with formAction(${name}Form, …) from @gyral/ssr so it also works without JavaScript (get_doc "forms#the-server-half").`,
      'Never keep passwords in state or re-fill them from values: state is serialized into the page.',
    ],
  };
}

/**
 * No schema library: `novalidate` turns off the browser's blocking bubbles, the parser reads
 * the browser's own constraint checks (required, type, minlength, pattern) and reports every
 * problem with a custom message at once, and focus moves to the first invalid field.
 */
export function nativeForm(
  tag: string,
  name: string,
  description: string | undefined,
  installed: Installed,
) {
  const component = `${comment(description)}import { define, fieldErrors, focus, html, invalid, type FieldIssue, type FormFields } from '@gyral/core';

export interface State {
  readonly values: FormFields;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly sent: { readonly name: string; readonly email: string } | undefined;
}

export type Msg = { readonly _tag: 'Submit'; readonly name: string; readonly email: string };

${FIELDS}

/** Custom messages per field for the browser's validity flags. */
const MESSAGES: Readonly<Record<string, { readonly missing: string; readonly wrong: string }>> = {
  name: { missing: 'Enter your name.', wrong: 'Enter your name.' },
  email: { missing: 'Enter your email address.', wrong: 'Enter an email address like name@example.com.' },
};

/**
 * One issue per invalid control, in field order, from the browser's constraint validation. The
 * form has novalidate, so the browser neither blocks the submit nor shows its own bubbles.
 * \`customError\` is skipped: that is the message invalid() set after the last submit.
 */
export function issuesOf(form: HTMLFormElement): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const field of FIELDS) {
    const control = form.elements.namedItem(field.name);
    if (!(control instanceof HTMLInputElement)) continue;
    const { valueMissing, typeMismatch, tooShort, tooLong, patternMismatch } = control.validity;
    const message = MESSAGES[field.name];
    if (valueMissing || (control.required && control.value.trim() === '')) {
      issues.push({ path: field.name, message: message?.missing ?? 'Fill in this field.' });
    } else if (typeMismatch || tooShort || tooLong || patternMismatch) {
      issues.push({ path: field.name, message: message?.wrong ?? 'Check this field.' });
    }
  }
  return issues;
}

/** What was submitted, keyed by field, so a rejected form is re-filled as the user left it. */
const valuesOf = (data: FormData | undefined): FormFields =>
  Object.fromEntries(
    FIELDS.map((f) => {
      const value = data?.get(f.name);
      return [f.name, typeof value === 'string' ? value : ''];
    }),
  );

${TEXT}

export const ${name} = define<State, Msg>()('${tag}', {
  init: () => ({ values: {}, errors: {}, sent: undefined }),
  intent: {
    // Every problem at once as IntentRejected (the same message form() sends), else Submit.
    Submit: ({ target, formData }) => {
      if (!(target instanceof HTMLFormElement)) return undefined;
      const values = valuesOf(formData);
      const issues = issuesOf(target);
      return issues.length > 0
        ? { _tag: 'IntentRejected', intent: 'Submit', issues, values }
        : { _tag: 'Submit', name: text(values, 'name').trim(), email: text(values, 'email').trim() };
    },
  },
  update: {
    // Valid: send it with a command here (submitForm from @gyral/http, or your own driver).
    Submit: (s, m) => ({ ...s, errors: {}, sent: { name: m.name, email: m.email } }),
    // Show every error, keep what was typed, and move focus to the first invalid field.
    IntentRejected: (s, m) => {
      const first = m.issues[0]?.path;
      return [
        { ...s, values: m.values ?? s.values, errors: fieldErrors(m.issues) },
        first === undefined ? [] : [focus(\`#\${first}\`)],
      ];
    },
  },
  view: (s, i) =>
    s.sent !== undefined
      ? html\`<p role="status">Thanks, \${s.sent.name}.</p>\`
      : html\`<form data-intent=\${i.Submit} novalidate>
          ${INPUTS}
          <button>Send</button>
        </form>\`,
});
`;
  const test = `import { describe, expect, it } from 'vitest';
import { focusTargetsIn, initial, step } from '@gyral/testing';
import { ${name} } from './${tag}.js';

describe('${tag} model', () => {
  const start = initial(${name}.spec).state;

  it('shows every error, keeps the values and focuses the first invalid field', () => {
    const next = step(${name}.spec, start, {
      _tag: 'IntentRejected',
      intent: 'Submit',
      issues: [
        { path: 'name', message: 'Enter your name.' },
        { path: 'email', message: 'Enter an email address like name@example.com.' },
      ],
      values: { name: '', email: 'ada@' },
    });
    expect(next.state.errors).toEqual({
      name: ['Enter your name.'],
      email: ['Enter an email address like name@example.com.'],
    });
    expect(next.state.values).toEqual({ name: '', email: 'ada@' });
    expect(focusTargetsIn(next.commands)).toEqual([{ selector: '#name' }]);
  });

  it('clears the errors on a valid submit', () => {
    const next = step(${name}.spec, { ...start, errors: { name: ['Enter your name.'] } }, {
      _tag: 'Submit',
      name: 'Ada',
      email: 'ada@example.com',
    });
    expect(next.state.errors).toEqual({});
    expect(next.state.sent).toEqual({ name: 'Ada', email: 'ada@example.com' });
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
      'Dependency-free: only @gyral/core. The browser checks the constraints in the markup (required, type="email", minlength, pattern); the parser turns them into your messages, all at once.',
      'Add a field: an entry in FIELDS and MESSAGES, and a field in the Submit message.',
      'Sending it: return a command from the Submit reducer (submitForm from @gyral/http, or your own driver). For the no-JavaScript path add action/method and handle the POST on the server (get_doc "forms").',
      ...(tested ? [] : [testNote(installed)]),
    ],
  };
}
