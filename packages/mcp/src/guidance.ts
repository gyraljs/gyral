// What get_api adds to a declaration so agents write code instead of walking types: a usage
// module and a concrete next call for runtime exports, a short note for types, and a nudge
// after several lookups in a row (agent pilot v3, Run B: assisted runs spent their whole
// request budget on get_api for ComponentSpec, FormDefinition, Errors… and never wrote code).
import { USAGE, type UsageName } from './usage.js';

export type Task =
  | 'form'
  | 'list'
  | 'timer'
  | 'effects'
  | 'http'
  | 'store'
  | 'child'
  | 'router'
  | 'ssr'
  | 'test'
  | 'component';

interface TaskInfo {
  readonly title: string;
  /** The tool call that gives working code for the task. */
  readonly next: string;
  /** What the next call returns, in a few words. */
  readonly gives: string;
  readonly usage?: UsageName;
}

/** In priority order: when lookups suggest several tasks, the first one wins. */
export const TASKS: Readonly<Record<Task, TaskInfo>> = {
  form: {
    title: 'Forms: native validation, errors, focus',
    next: 'scaffold_component({ tag: "signup-form", kind: "form-native" })',
    gives:
      'a complete form with novalidate, your messages, invalid() and focus on the first error (the recipe with tests: get_doc("recipes#a-signup-form-with-native-validation"))',
    usage: 'form',
  },
  list: {
    title: 'Lists: keyed rows, filters, ids in controls',
    next: 'get_doc("recipes#a-todo-list-with-filters")',
    gives: 'a todo list with filters and its tests',
    usage: 'list',
  },
  timer: {
    title: 'Timers: every, delay, debounce in subscriptions',
    next: 'get_example("seconds-elapsed")',
    gives: 'a clock driven by every() in subscriptions',
    usage: 'timer',
  },
  effects: {
    title: 'Side effects: commands and drivers',
    next: 'get_example("custom-driver")',
    gives: 'a driver of its own with command() and its answers as messages',
    usage: 'effects',
  },
  http: {
    title: 'HTTP: requests as commands (@gyral/http)',
    next: 'get_example("http-random-user")',
    gives: 'a fetch with loading and error states',
  },
  store: {
    title: 'Shared state: stores',
    next: 'get_example("shared-cart")',
    gives: 'a store read and changed by distant components',
  },
  child: {
    title: 'Child components: props down, outputs up',
    next: 'get_example("bmi-nested")',
    gives: 'a reusable child with props and outputs',
  },
  router: {
    title: 'Routing (@gyral/router)',
    next: 'get_example("routing-view")',
    gives: 'client-side routes with listen in subscriptions',
  },
  ssr: {
    title: 'Server rendering (@gyral/ssr)',
    next: 'scaffold_component({ tag: "home-page", kind: "ssr-page" })',
    gives: 'a light-DOM page, a client entry and a renderPage() route',
  },
  test: {
    title: 'Tests (@gyral/testing)',
    next: 'get_doc("testing")',
    gives: 'model tests with step/run and browser tests with mount()',
    usage: 'test',
  },
  component: {
    title: 'A component: state, intents, update, view',
    next: 'scaffold_component({ tag: "my-widget", kind: "basic" })',
    gives:
      'a complete component (and a model test when vitest is installed); or get_example("hello-world")',
    usage: 'component',
  },
};

const PRIORITY = Object.keys(TASKS) as Task[];

/** Runtime exports agents look up, by task, with a one-line purpose for the "*" index. */
export const RUNTIME: Readonly<Record<string, readonly [Task, string]>> = {
  define: ['component', "define<State, Msg>()('my-tag', { init, intent, update, view })"],
  html: ['component', 'view templates; elements name intents with data-intent'],
  css: ['component', 'component styles (spec.styles)'],
  nothing: ['component', 'renders nothing'],
  keyed: ['component', 'keyed(key, template): fresh elements when the key changes'],
  raw: ['component', 'trusted HTML, for content you already sanitized'],
  svg: ['component', 'SVG templates'],
  prop: ['component', 'prop.string({ default }), prop.number(…): props from parent or attributes'],
  defineHook: ['component', 'behaviour on one element (a widget, an observer)'],
  call: [
    'component',
    "call(selector, method, ...args): a command, e.g. call('dialog', 'showModal')",
  ],
  each: ['list', 'each(items, key, row, pick?): keyed lists with pure rows'],
  intentsOf: ['list', 'const i = intentsOf<typeof C>(): intent names for list rows'],
  focus: ['form', "focus(selector): a command; focus('#name') after the update renders"],
  fieldErrors: ['form', 'fieldErrors(issues): error messages by field name'],
  invalid: ['form', 'invalid(errors): an element hook that mirrors errors into native validity'],
  form: ['form', 'form(schema, toMsg): a schema-checked submit intent (needs a schema library)'],
  defineForm: ['form', 'defineForm(schema, { secret? }): a schema form shared with the server'],
  field: ['form', 'field(schema, toMsg): one schema-checked control'],
  every: ['timer', 'every(ms, (now) => msg): a timer, returned from subscriptions'],
  delay: ['timer', 'delay(ms, msg): a message later, as a command'],
  debounce: ['timer', 'debounce(ms, msg, key): the last message after a pause'],
  command: ['effects', 'command(driver, input, { onSuccess, onFailure })'],
  defineDriver: ['effects', 'defineDriver<In, Out>({ name, run, concurrency? }): your own effect'],
  retry: ['effects', 'retry(driver, policy): the same driver, retried when it rejects'],
  subscription: [
    'effects',
    'subscription(name, subscribe): a driver over a feed Gyral does not own',
  ],
  provideDrivers: ['effects', 'provideDrivers(element, { name: driver }): substitute drivers'],
  get: ['http', 'get(url, { onSuccess, onFailure }): a GET as a command'],
  request: ['http', 'request({ method, url, body }, handlers): any request as a command'],
  submitForm: ['http', 'submitForm(url, formData, handlers): post a form; 422 → IntentRejected'],
  defineStore: ['store', "defineStore<S, M>('name', { init, update }): shared state"],
  send: ['store', 'send(store, msg): a command that updates a store'],
  changed: ['store', "changed(store, msg): a store's new and previous state, in StoreChanged"],
  outputs: ['child', "const emit = outputs<Out>(): a child's outputs to its parent"],
  child: ['child', "child(Child, (out) => msg): a parent's intent for a child's outputs"],
  navigate: ['router', 'navigate(url): a command'],
  listen: ['router', 'listen(toMsg): the location, then every URL change, as messages'],
  routes: ['router', 'routes(table): match a URL against a route table'],
  renderPage: ['ssr', 'renderPage({ title, body, scripts }): a full HTML Response'],
  renderToString: ['ssr', 'renderToString(template): server HTML'],
  formAction: ['ssr', 'formAction(definition, { intent, valid, invalid }): the no-JS POST'],
  prerender: ['ssr', 'prerender(options): render each path and write static pages'],
  step: ['test', 'step(C.spec, state, msg): { state, commands }'],
  run: ['test', 'run(C.spec, msgs, { state?, props? }): from init or from state'],
  mount: ['test', 'await mount(C, { drivers }): $, type, click, settled, dispose'],
  parse: ['test', "parse(C, 'Intent', { value: '3' }): one parser, no DOM"],
  focusTargetsIn: ['test', 'where reducers asked focus to go'],
  settled: ['test', 'await settled(): every component rendered'],
};

/** Types agents look up, by the task they suggest (others suggest `component`). */
const TYPE_TASK: readonly (readonly [RegExp, Task])[] = [
  [/^(Form|Field)|^IntentRejected$|^StandardSchemaV1$/, 'form'],
  [/^(TemplateResult|ListResult)$/, 'list'],
  [/^(Command|CommandHandlers|Concurrency|RetryPolicy|Driver|AnyDriver|DriverContext)/, 'effects'],
  [/^(Store|AnyStore)/, 'store'],
  [/^(Outputs?Of|OutputEvent|OutputSource|ChildSource)$/, 'child'],
];

export function taskOf(name: string, kind: string): Task {
  const runtime = RUNTIME[name];
  if (runtime !== undefined) return runtime[0];
  if (kind === 'type') for (const [re, task] of TYPE_TASK) if (re.test(name)) return task;
  return 'component';
}

/** Types users do write, with where they write them. */
const WRITTEN: Readonly<Record<string, string>> = {
  TemplateResult:
    'You write it in one place: the return type of a list row, `const Row = (t: Todo): TemplateResult => html`…``.',
  Command:
    'You write it as the return type of a helper that builds a command: `const load = (id: string): Command<Msg> => command(…)`.',
  Stateless: '`define<Stateless, Msg>()(…)` for a component with no state of its own.',
  FieldIssue:
    'You write it in a native submit parser that collects `{ path, message }` issues (scaffold_component kind "form-native").',
  FormFields: 'The submitted values record kept in state to re-fill a form.',
  IntentRejected:
    'In a component you only write the `IntentRejected` reducer key; `m.issues` and `m.values` are typed for you.',
};

/** The note get_api appends to a type. */
export function typeNote(name: string, snippetChecks: boolean): string {
  const check = snippetChecks
    ? 'check_snippet names the real type errors'
    : 'your typecheck names the real type errors';
  const written = WRITTEN[name];
  const task = TASKS[taskOf(name, 'type')];
  return written === undefined
    ? `Note: you rarely write \`${name}\` yourself: TypeScript infers it from define() and form(). Start from \`${task.next}\` (or get_example), write the module, and ${check}; look a type up only when an error names it.`
    : `Note: ${written} Everything else TypeScript infers from define(); start from \`${task.next}\` and ${check}.`;
}

/** The usage module and next call get_api appends to a runtime export. */
export function usageFor(name: string, snippetChecks: boolean): string {
  const runtime = RUNTIME[name];
  if (runtime === undefined) return '';
  const task = TASKS[runtime[0]];
  const check = snippetChecks
    ? 'then check_snippet it until it passes'
    : 'then typecheck it in the project';
  const schema =
    name === 'form' || name === 'defineForm' || name === 'field'
      ? `\`${name}\` needs a Standard Schema library (valibot, zod 4) in the project, and scaffold_component kind "form" writes that version when one is installed. With none, validate natively, as below.\n\n`
      : '';
  const code =
    task.usage === undefined ? '' : `\`\`\`ts\n${USAGE[task.usage].trimEnd()}\n\`\`\`\n\n`;
  return `## Usage (${task.title})\n\n${schema}${code}Next: \`${task.next}\` gives ${task.gives}. Adapt it to the task, write the file, ${check}.`;
}

/** Counts get_api calls since the agent last started from code, per server instance. */
export class Steering {
  #lookups = 0;
  #tasks = new Set<Task>();

  /** A code tool ran (get_example, scaffold_component, check_snippet): start over. */
  startedFromCode(): void {
    this.#lookups = 0;
    this.#tasks.clear();
  }

  /** Records one get_api call; returns the nudge to append, or '' before the 4th. */
  lookedUp(task: Task | undefined, snippetChecks: boolean): string {
    this.#lookups += 1;
    if (task !== undefined) this.#tasks.add(task);
    if (this.#lookups < 4) return '';
    const best = PRIORITY.find((t) => this.#tasks.has(t)) ?? 'component';
    const check = snippetChecks
      ? 'check_snippet it: its errors name the few types you actually need'
      : 'typecheck it: the errors name the few types you actually need';
    return `---\nThis is get_api call ${String(this.#lookups)} in a row without starting from code. More declarations won't write the component, and TypeScript infers most of these types. Next: \`${TASKS[best].next}\`, adapt it to the task, write the file, then ${check}.`;
  }
}
