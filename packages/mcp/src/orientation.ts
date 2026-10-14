// start_here and the workflow every tool description repeats. Many MCP clients drop the
// server's instructions, so the workflow has to travel with the tools themselves.
import type { Corpus } from './types.js';

/** The recommended loop, in one line, for tool descriptions. */
export function workflow(snippetChecks: boolean): string {
  const check = snippetChecks
    ? 'check_snippet it and apply the suggested fixes until it passes'
    : 'typecheck it in the project (tsc, vite build) and fix what it reports';
  return `Gyral workflow: start_here once, then start from get_example or scaffold_component (working code); write the module right away; ${check}; get_api only for a name you already saw in an example or an error.`;
}

interface UseCase {
  readonly task: string;
  readonly examples: readonly string[];
  /** A docs path for get_doc. */
  readonly doc: string;
  /** The scaffold_component kind to start from, when one fits. */
  readonly scaffold?: string;
}

/** Use case → where to start. The test suite checks every example and doc exists. */
export const USE_CASES: readonly UseCase[] = [
  {
    task: 'A first component: state, buttons, derived text',
    examples: ['hello-world'],
    doc: 'components',
    scaffold: 'basic',
  },
  {
    task: 'Text inputs, checkboxes, selects',
    examples: ['hello-world'],
    doc: 'intent',
    scaffold: 'basic',
  },
  {
    task: 'A form with validation, errors and focus',
    examples: ['register', 'no-js-first'],
    doc: 'forms',
    scaffold: 'form (or form-native: no dependencies)',
  },
  {
    task: 'Fetch data with loading and error states',
    examples: ['http-random-user'],
    doc: 'effects',
  },
  {
    task: 'Search as you type: debounce, cancel stale answers',
    examples: ['http-search-github', 'typeahead-race'],
    doc: 'effects#concurrency-lanes',
  },
  {
    task: 'Accessible combobox, keyboard navigation',
    examples: ['autocomplete-search'],
    doc: 'accessibility',
  },
  {
    task: 'A clock, polling, a timer (every, not setInterval)',
    examples: ['seconds-elapsed'],
    doc: 'effects',
  },
  { task: 'Lists and nested child components', examples: ['nested-folders'], doc: 'views' },
  { task: 'A reusable child with props and outputs', examples: ['bmi-nested'], doc: 'components' },
  {
    task: 'State shared by distant components (a store)',
    examples: ['shared-cart'],
    doc: 'stores',
  },
  { task: 'Client-side routing', examples: ['routing-view'], doc: 'routing' },
  {
    task: 'Server rendering with hydration',
    examples: ['isomorphic'],
    doc: 'server-rendering',
    scaffold: 'ssr-page',
  },
  { task: 'Undo, redo, replay (history as data)', examples: ['undo-replay'], doc: 'update' },
  {
    task: 'Wrap a canvas or third-party widget in a driver',
    examples: ['custom-driver'],
    doc: 'effects',
  },
  {
    task: 'CSS transitions and animations',
    examples: ['animation', 'animated-letters'],
    doc: 'styling',
  },
  {
    task: 'Dialogs and popovers with invoker commands',
    examples: ['invoker-commands'],
    doc: 'intent',
  },
  { task: 'Workers, owned delays, long-running work', examples: ['workload-lab'], doc: 'effects' },
  { task: 'Tests without a DOM, browser tests', examples: [], doc: 'testing' },
];

const MENTAL_MODEL = `A Gyral component is one Model-View-Intent loop compiled to a custom element:
- intent: parses DOM events into typed messages (\`{ readonly _tag: 'Add'; … }\`);
- update: one pure reducer per message tag, returning the next state, or \`[state, [command]]\`;
- view: a pure function of state that names intents (\`data-intent=\${i.Add}\`), rendered by
  Gyral's own \`html\` from @gyral/core;
- side effects are commands (data) that drivers perform; long-lived work (timers, router
  \`listen\`, sockets) is listed in \`subscriptions(state, props)\`.`;

const RULES = `1. \`define<State, Msg>()('my-tag', { init, intent, update, view })\`: two calls, types first.
2. \`update\` has a reducer for every tag of \`Msg\`; reducers, \`init\` and \`view\` are pure (no
   fetch, timers, Date.now, Math.random, DOM or storage): return commands instead.
3. Views never attach handlers: \`data-intent=\${i.Save}\`; booleans bind with \`?disabled=\${…}\`;
   form controls with \`value=\${…}\`, never \`.value=\`.
4. Timers: \`every(ms, (now) => msg, key?)\` from @gyral/time inside \`subscriptions\` (there is no
   \`periodic\`). Router \`listen\` goes in \`subscriptions\` too, never in \`init\`.
5. List rows (\`each\`) are pure; a row that uses \`intentsOf<typeof C>()\` needs an explicit
   \`TemplateResult\` return type.
6. Server-rendered state is plain JSON. Import only packages the project has installed.
7. A component in its own module must be imported by the entry (\`import './my-widget.js';\`
   in src/main.ts), or its tag is never defined and stays an empty element.`;

/** The orientation start_here returns: model, rules, workflow, tools and the use-case index. */
export function orientation(corpus: Corpus, snippetChecks: boolean): string {
  const examples = new Set(corpus.examples.map((e) => e.name));
  const index = USE_CASES.map((u) => {
    const shown = u.examples.filter((e) => examples.has(e));
    const start = [
      ...(shown.length > 0 ? [`get_example ${shown.map((e) => `"${e}"`).join(' / ')}`] : []),
      ...(u.scaffold === undefined ? [] : [`scaffold_component ${u.scaffold}`]),
    ];
    return `| ${u.task} | ${start.join('; ') || '—'} | get_doc "${u.doc}" |`;
  });
  const check = snippetChecks
    ? '| Check code before presenting it | `check_snippet` (type errors plus suggested fixes for common Gyral mistakes; repeat until clean) |'
    : '| Check code before presenting it | your project typecheck (`tsc`, `vite build`); the local stdio server (`npx -y @gyral/mcp`) adds `check_snippet` |';
  return `# Gyral ${corpus.version}: start here

${MENTAL_MODEL}

## Rules

${RULES}

## Workflow

1. Find the closest use case below; read that example (get_example) or scaffold one
   (scaffold_component, which reads package.json and imports only installed packages).
2. Write a minimal implementation of the task right away: State, Msg, intent, update, view.
3. ${snippetChecks ? 'check_snippet the whole module; apply the suggested fixes and check again until it passes.' : 'Typecheck it in the project and fix every error.'}
4. Only then refine. Use get_api only for a name you saw in an example or an error (TypeScript
   infers Gyral's types from define(), so don't walk them); search_docs / get_doc for one
   concept you need.

## Which tool when

| Need | Tool |
| --- | --- |
| Working code for a use case | \`get_example\` (\`list_examples\` for all) |
| Starting code that fits the project | \`scaffold_component\` (basic, form, form-native, ssr-page) |
| The signature of a name from an example or an error | \`get_api\` (\`"*"\`: functions by task) |
| A concept or guide section | \`search_docs\`, then \`get_doc\` |
${check}

## Use cases

| Task | Start from | Guide |
| --- | --- | --- |
${index.join('\n')}

Deeper reading: the gyral://skill resource and gyral://skill/references/{name} (components.md,
intent.md, forms.md, effects-and-drivers.md, testing.md, anti-patterns.md, …).`;
}
