// Short, complete usage modules that get_api appends to a runtime export's declaration, one
// per task, so an agent that looks up `each` or `fieldErrors` sees working code at once. They
// follow the gyral.dev recipes; the test suite typechecks each one with check_snippet.

/** A component with a parsed input: define, html, intents, pure reducers. */
const component = `import { define, html } from '@gyral/core';

interface State {
  readonly count: number;
  readonly step: number;
}
type Msg = { readonly _tag: 'Add' } | { readonly _tag: 'Step'; readonly step: number };

export const Stepper = define<State, Msg>()('my-stepper', {
  init: () => ({ count: 0, step: 1 }),
  intent: {
    Add: true,
    // Parse once, at the boundary: undefined ignores the event.
    Step: ({ value }) => {
      const step = Number(value);
      return Number.isInteger(step) ? { _tag: 'Step', step } : undefined;
    },
  },
  update: {
    Add: (s) => ({ ...s, count: s.count + s.step }),
    Step: (s, m) => ({ ...s, step: m.step }),
  },
  view: (s, i) => html\`
    <label for="step">Step</label>
    <input id="step" type="number" value=\${s.step} data-intent=\${i.Step} />
    <button type="button" data-intent=\${i.Add}>Add \${s.step}</button>
    <output aria-live="polite">\${s.count}</output>
  \`,
});
// In its own file, import it from the entry (src/main.ts): import './my-stepper.js';
`;

/** A filtered list: each with an id key, a pure row, a module-level intentsOf. */
const list = `import { define, each, html, intentsOf, type TemplateResult } from '@gyral/core';

interface Item {
  readonly id: number;
  readonly text: string;
  readonly done: boolean;
}
interface State {
  readonly items: readonly Item[];
  readonly onlyOpen: boolean;
}
type Msg =
  | { readonly _tag: 'Toggle'; readonly id: number }
  | { readonly _tag: 'OnlyOpen'; readonly on: boolean };

const i = intentsOf<typeof Checklist>();

// A row reads only its item and module constants; the id travels in value=, never a position.
const Row = (item: Item): TemplateResult =>
  html\`<li>
    <input id=\${\`item-\${String(item.id)}\`} type="checkbox" value=\${item.id}
      ?checked=\${item.done} data-intent=\${i.Toggle} />
    <label for=\${\`item-\${String(item.id)}\`}>\${item.text}</label>
  </li>\`;

export const Checklist = define<State, Msg>()('my-checklist', {
  init: () => ({ items: [{ id: 1, text: 'Write it', done: false }], onlyOpen: false }),
  intent: {
    Toggle: ({ value }) => {
      const id = Number(value);
      return Number.isInteger(id) ? { _tag: 'Toggle', id } : undefined;
    },
    OnlyOpen: ({ checked }) => ({ _tag: 'OnlyOpen', on: checked === true }),
  },
  update: {
    Toggle: (s, m) => ({
      ...s,
      items: s.items.map((t) => (t.id === m.id ? { ...t, done: !t.done } : t)),
    }),
    OnlyOpen: (s, m) => ({ ...s, onlyOpen: m.on }),
  },
  view: (s, v) => html\`
    <label>
      <input type="checkbox" ?checked=\${s.onlyOpen} data-intent=\${v.OnlyOpen} /> Only open
    </label>
    <ul>\${each(s.onlyOpen ? s.items.filter((t) => !t.done) : s.items, (t) => t.id, Row)}</ul>
  \`,
});
`;

/** A native form: novalidate, the browser's validity, fieldErrors, invalid(), focus(). */
const form = `import { define, fieldErrors, focus, html, invalid, type FieldIssue } from '@gyral/core';

interface State {
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly sent: string | undefined;
}
type Msg = { readonly _tag: 'Submit'; readonly name: string; readonly email: string };

const FIELDS = ['name', 'email'] as const;

/** Your messages for the browser's own checks; novalidate only stops its blocking bubble. */
function issuesOf(form: HTMLFormElement): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const field of FIELDS) {
    const input = form.elements.namedItem(field);
    if (!(input instanceof HTMLInputElement)) continue;
    if (input.validity.valueMissing || input.value.trim() === '')
      issues.push({ path: field, message: \`Enter your \${field}.\` });
    else if (input.validity.typeMismatch)
      issues.push({ path: field, message: 'Enter an email address like ada@example.com.' });
  }
  return issues;
}

const text = (data: FormData | undefined, key: string): string => {
  const value = data?.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

export const SignupForm = define<State, Msg>()('signup-form', {
  init: () => ({ errors: {}, sent: undefined }),
  intent: {
    Submit: ({ target, formData }) => {
      if (!(target instanceof HTMLFormElement)) return undefined;
      const issues = issuesOf(target);
      return issues.length > 0
        ? { _tag: 'IntentRejected', intent: 'Submit', issues }
        : { _tag: 'Submit', name: text(formData, 'name'), email: text(formData, 'email') };
    },
  },
  update: {
    Submit: (_s, m) => ({ errors: {}, sent: \`\${m.name} (\${m.email})\` }),
    // Every error at once; focus moves to the first invalid field after the render.
    IntentRejected: (s, m) => {
      const first = m.issues[0]?.path;
      return [
        { ...s, errors: fieldErrors(m.issues) },
        first === undefined ? [] : [focus(\`#\${first}\`)],
      ];
    },
  },
  view: (s, i) => html\`
    <form novalidate data-intent=\${i.Submit}>
      \${FIELDS.map(
        (f) => html\`<p>
          <label for=\${f}>\${f === 'name' ? 'Name' : 'Email'}</label>
          <input id=\${f} name=\${f} type=\${f === 'email' ? 'email' : 'text'} required
            aria-describedby=\${\`\${f}-error\`} \${invalid(s.errors[f])} />
          <span id=\${\`\${f}-error\`}>\${s.errors[f]?.join(' ') ?? ''}</span>
        </p>\`,
      )}
      <button>Sign up</button>
    </form>
    <p role="status">\${s.sent === undefined ? '' : \`Signed up \${s.sent}.\`}</p>
  \`,
});
`;

/** A driver of your own and a command: the only code that touches the network. */
const effects = `import { command, define, defineDriver, html, type Command } from '@gyral/core';

export const lookup = defineDriver<string, string>({
  name: 'lookup',
  concurrency: 'switch', // a new query cancels the one in flight
  run: async (query, { signal }) => {
    const response = await fetch(\`/api/lookup?q=\${encodeURIComponent(query)}\`, { signal });
    if (!response.ok) throw new Error(\`HTTP \${String(response.status)}\`);
    return response.text();
  },
});

interface State {
  readonly answer: string;
  readonly busy: boolean;
}
type Msg =
  | { readonly _tag: 'Ask'; readonly query: string }
  | { readonly _tag: 'Answered'; readonly answer: string }
  | { readonly _tag: 'Failed' };

const ask = (query: string): Command<Msg> =>
  command(lookup, query, {
    onSuccess: (answer): Msg => ({ _tag: 'Answered', answer }),
    onFailure: (): Msg => ({ _tag: 'Failed' }),
  });

export const Lookup = define<State, Msg>()('my-lookup', {
  init: () => ({ answer: '', busy: false }),
  intent: {
    Ask: ({ value }) =>
      value === undefined || value.trim() === '' ? undefined : { _tag: 'Ask', query: value },
  },
  update: {
    // Reducers stay pure: they return the command, a driver runs it.
    Ask: (s, m) => [{ ...s, busy: true }, [ask(m.query)]],
    Answered: (_s, m) => ({ answer: m.answer, busy: false }),
    Failed: () => ({ answer: 'No answer right now.', busy: false }),
  },
  view: (s, i) => html\`
    <input type="search" aria-label="Ask" data-intent=\${i.Ask} />
    <p aria-live="polite">\${s.busy ? 'Looking…' : s.answer}</p>
  \`,
});
`;

/** A timer in subscriptions: running while the state says so, never setInterval. */
const timer = `import { define, html } from '@gyral/core';
import { every } from '@gyral/time';

interface State {
  readonly running: boolean;
  readonly ticks: number;
}
type Msg = { readonly _tag: 'Toggle' } | { readonly _tag: 'Tick' };

export const Ticker = define<State, Msg>()('my-ticker', {
  init: () => ({ running: false, ticks: 0 }),
  // Gyral starts the timer when this list gains it and stops it when it goes.
  subscriptions: (s) => (s.running ? [every(1000, (): Msg => ({ _tag: 'Tick' }))] : []),
  intent: { Toggle: true },
  update: {
    Toggle: (s) => ({ ...s, running: !s.running }),
    Tick: (s) => ({ ...s, ticks: s.ticks + 1 }),
  },
  view: (s, i) => html\`
    <button type="button" data-intent=\${i.Toggle}>\${s.running ? 'Stop' : 'Start'}</button>
    <output>\${s.ticks}</output>
  \`,
});
`;

/** Model tests without a DOM. */
const test = `import { expect, it } from 'vitest';
import { define, focus, html } from '@gyral/core';
import { focusTargetsIn, run, step } from '@gyral/testing';

// Normally imported from its module: import { Counter } from './my-counter.js';
type Msg = { readonly _tag: 'Add' } | { readonly _tag: 'Reset' };
const Counter = define<{ readonly count: number }, Msg>()('my-counter', {
  init: () => ({ count: 0 }),
  intent: { Add: true, Reset: true },
  update: {
    Add: (s) => ({ count: s.count + 1 }),
    Reset: () => [{ count: 0 }, [focus('button')]],
  },
  view: (s, i) => html\`<button type="button" data-intent=\${i.Add}>\${s.count}</button>
    <button type="button" data-intent=\${i.Reset}>Reset</button>\`,
});

it('counts and resets', () => {
  expect(step(Counter.spec, { count: 1 }, { _tag: 'Add' }).state).toEqual({ count: 2 });
  expect(run(Counter.spec, [{ _tag: 'Add' }, { _tag: 'Add' }]).state.count).toBe(2);
  expect(focusTargetsIn(step(Counter.spec, { count: 2 }, { _tag: 'Reset' }).commands)).toEqual([
    { selector: 'button' },
  ]);
});
`;

/** Usage modules by task (tasks without one point at an example instead). */
export const USAGE = { component, list, form, effects, timer, test } as const;
export type UsageName = keyof typeof USAGE;
