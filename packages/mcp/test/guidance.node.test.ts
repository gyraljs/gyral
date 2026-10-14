// get_api steers to working code: usage modules for runtime exports (each typechecks), notes
// for types, the task index for "*", and a nudge after several reads in a row, driven
// through a real MCP client against the server, as an agent sees it.
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildCorpus } from '../scripts/build-corpus.mjs';
import { checkSnippet } from '../src/check.js';
import { getDoc, parseLlmsFull } from '../src/docs.js';
import { indexApi } from '../src/api-index.js';
import { RUNTIME, TASKS, typeNote, usageFor } from '../src/guidance.js';
import { createServer } from '../src/server.js';
import { USAGE } from '../src/usage.js';
import type { Corpus } from '../src/types.js';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));
let corpus: Corpus;
let client: Client | undefined;

beforeAll(() => {
  corpus = buildCorpus(parseLlmsFull);
}, 60_000);

afterEach(async () => {
  await client?.close();
  client = undefined;
});

/** A fresh server and client, as one stdio session (or HTTP's per-request server). */
async function connect(local = true): Promise<(name: string, args?: object) => Promise<string>> {
  const server = createServer(corpus, local ? { projectDir: pkgDir } : { snippetChecks: false });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const connected = new Client({ name: 'guidance-test', version: '0.0.0' });
  await connected.connect(clientSide);
  client = connected;
  return async (name, args = {}) => {
    const result = await connected.callTool({ name, arguments: { ...args } });
    const content = result.content as readonly { readonly text?: string }[];
    return content.map((c) => c.text ?? '').join('\n');
  };
}

describe('usage modules', () => {
  for (const [name, code] of Object.entries(USAGE)) {
    it(`"${name}" typechecks and passes check_snippet`, () => {
      expect(checkSnippet(code, pkgDir).report, name).toMatch(
        /^No type errors \(TypeScript [^)]+\) and no common Gyral mistakes found\.$/,
      );
    }, 60_000);
  }

  it('point at examples, docs and scaffolds that exist', () => {
    const examples = new Set(corpus.examples.map((e) => e.name));
    for (const task of Object.values(TASKS)) {
      for (const call of `${task.next} ${task.gives}`.matchAll(
        /(get_example|get_doc)\("([^"]+)"\)/g,
      )) {
        if (call[1] === 'get_example') expect(examples, task.title).toContain(call[2]);
        else expect(getDoc(corpus.docs, call[2] ?? ''), call[2]).toBeDefined();
      }
      const kind = /kind: "([\w-]+)"/.exec(task.next)?.[1];
      if (kind !== undefined) expect(['basic', 'form', 'form-native', 'ssr-page']).toContain(kind);
    }
  });

  it('cover only names the API exports', () => {
    const names = new Set(corpus.api.map((e) => e.name));
    for (const name of Object.keys(RUNTIME)) expect(names, name).toContain(name);
  });
});

describe('get_api answers', () => {
  it('adds a usage module and the next call to a runtime export', async () => {
    const call = await connect();
    const define = await call('get_api', { symbol: 'define' });
    expect(define).toContain('function define(): <');
    expect(define).toContain('## Usage (A component');
    expect(define).toContain('scaffold_component({ tag: "my-widget", kind: "basic" })');
    for (const symbol of ['fieldErrors', 'invalid', 'focus', 'defineForm']) {
      const text = await call('get_api', { symbol });
      expect(text, symbol).toContain(`### \`${symbol}\``);
      expect(text, symbol).toContain('novalidate');
      expect(text, symbol).toContain(
        'scaffold_component({ tag: "signup-form", kind: "form-native" })',
      );
    }
    expect(await call('get_api', { symbol: 'form' })).toContain('needs a Standard Schema library');
    for (const symbol of ['each', 'intentsOf'])
      expect(await call('get_api', { symbol }), symbol).toContain(
        'get_doc("recipes#a-todo-list-with-filters")',
      );
    expect(await call('get_api', { symbol: 'every' })).toContain('get_example("seconds-elapsed")');
  });

  it('adds a short note to a type instead of more types', async () => {
    const call = await connect();
    const definition = await call('get_api', { symbol: 'FormDefinition' });
    expect(definition).toContain('interface FormDefinition');
    expect(definition).toContain('you rarely write `FormDefinition` yourself');
    expect(definition).toContain('kind: "form-native"');
    expect(definition).toContain('check_snippet names the real type errors');
    expect(await call('get_api', { symbol: 'TemplateResult' })).toContain(
      'the return type of a list row',
    );
    expect(await call('get_api', { symbol: 'SpecBody' })).toContain('you rarely write `SpecBody`');
    expect(typeNote('ComponentSpec', false)).toContain('your typecheck');
    expect(usageFor('define', false)).toContain('typecheck it in the project');
  });

  it('lists the functions by task for "*", with the types collapsed', async () => {
    const call = await connect();
    const index = await call('get_api', { symbol: '*' });
    expect(index).toMatch(/^# Gyral API by task/);
    expect(index).toContain('### Forms: native validation, errors, focus');
    expect(index).toContain(
      'Start from: `scaffold_component({ tag: "signup-form", kind: "form-native" })`',
    );
    expect(index).toContain("- `define` (@gyral/core): define<State, Msg>()('my-tag'");
    expect(index).toContain('look these up only when a compile error names one');
    // Types of other packages are a pointer, not a list.
    expect(index).not.toContain('IndexedDBRange');
    expect(index.indexOf('### Types')).toBeGreaterThan(index.indexOf('### Other functions'));
    expect(indexApi(corpus.api, '@gyral/core/indexeddb')).toContain('IndexedDBRange');
    expect(await call('get_api', { symbol: '*', package: 'nope' })).toBe(
      'No exports for package "nope".',
    );
  });
});

describe('repeated lookups', () => {
  it('nudge from the fourth get_api call to the task the symbols suggest', async () => {
    const call = await connect();
    for (const symbol of ['form', 'FormDefinition', 'IntentRejected'])
      expect(await call('get_api', { symbol }), symbol).not.toContain('in a row');
    const fourth = await call('get_api', { symbol: 'ComponentSpec' });
    expect(fourth).toContain('type ComponentSpec');
    expect(fourth).toContain('This is get_api call 4 in a row without writing code');
    expect(fourth).toContain(
      'Next: `scaffold_component({ tag: "signup-form", kind: "form-native" })`',
    );
    // A repeat (perhaps after the harness compacted the first answer) keeps the declaration.
    const repeat = await call('get_api', { symbol: 'form' });
    expect(repeat).toContain('function form<');
    expect(repeat).toContain('## Usage');
    expect(repeat).toContain('get_api call 5 in a row');
    // Misses count too.
    expect(await call('get_api', { symbol: 'Errors' })).toContain('get_api call 6 in a row');
  });

  it('start over after a write-side tool, and default to the basic scaffold', async () => {
    const call = await connect();
    for (const symbol of ['define', 'Update', 'Reducer']) await call('get_api', { symbol });
    await call('scaffold_component', { tag: 'my-widget', kind: 'basic' });
    for (const symbol of ['Next', 'Command', 'Ctx'])
      expect(await call('get_api', { symbol })).not.toContain('in a row');
    const fourth = await call('get_api', { symbol: 'Tagged' });
    expect(fourth).toContain('get_api call 4 in a row');
    // Command suggests effects, which outranks a plain component.
    expect(fourth).toContain('get_example("custom-driver")');
    await call('check_snippet', { code: 'export const n: number = 1;\n' });
    expect(await call('get_api', { symbol: 'Tagged' })).not.toContain('in a row');
  }, 60_000);
});

describe('repeated reads', () => {
  it('nudge from the third get_example to adapt the examples already read', async () => {
    const call = await connect();
    for (const name of ['nested-folders', 'typeahead-race'])
      expect(await call('get_example', { name }), name).not.toContain('in a row');
    const third = await call('get_example', { name: 'register' });
    expect(third).toContain('src/');
    expect(third).toContain('This is get_example call 3 in a row without writing code.');
    expect(third).toContain(
      'Next: adapt the closest example you read ("nested-folders", "typeahead-race", "register"; the last was "register") to the task, write the file, then check_snippet it and apply the suggested fixes until it passes.',
    );
    // A re-read moves to the end; a miss counts but names nothing.
    const again = await call('get_example', { name: 'nested-folders' });
    expect(again).toContain('get_example call 4 in a row');
    expect(again).toContain(
      '("typeahead-race", "register", "nested-folders"; the last was "nested-folders")',
    );
    const miss = await call('get_example', { name: 'todo-list' });
    expect(miss).toContain('No example "todo-list"');
    expect(miss).toContain('get_example call 5 in a row');
    expect(miss).not.toContain('"todo-list";');
  });

  it('no longer let get_example reset the get_api count, and point lookups at the example', async () => {
    const call = await connect();
    await call('get_example', { name: 'hello-world' });
    for (const symbol of ['define', 'html', 'Update'])
      expect(await call('get_api', { symbol }), symbol).not.toContain('in a row');
    const fourth = await call('get_api', { symbol: 'ComponentSpec' });
    expect(fourth).toContain('This is get_api call 4 in a row without writing code.');
    expect(fourth).toContain('Next: adapt the example you read ("hello-world") to the task');
  });

  it('nudge from the eighth read of any kind, resources included, without changing them', async () => {
    const call = await connect();
    const skill = await client?.readResource({ uri: 'gyral://skill' });
    const llms = await client?.readResource({ uri: 'gyral://llms.txt' });
    const forms = await client?.readResource({ uri: 'gyral://skill/references/forms.md' });
    for (const read of [skill, llms, forms]) {
      const first = read?.contents[0];
      expect(first !== undefined && 'text' in first ? first.text : '').not.toContain('in a row');
    }
    expect(await call('start_here')).not.toContain('in a row');
    expect(await call('list_examples')).not.toContain('in a row');
    expect(await call('search_docs', { query: 'subscriptions' })).not.toContain('in a row');
    expect(await call('get_doc', { path: 'forms' })).not.toContain('in a row');
    const eighth = await call('get_doc', { path: 'intent' });
    expect(eighth).toContain(
      'This is read call 8 in a row (docs, examples, API) without writing code. More reading won\'t write the component. Next: `scaffold_component({ tag: "my-widget", kind: "basic" })`, adapt it to the task, write the file, then check_snippet it.',
    );
    await call('scaffold_component', { tag: 'my-widget', kind: 'basic' });
    expect(await call('get_doc', { path: 'intent' })).not.toContain('in a row');
  });

  it('suggest your own typecheck and build where check_snippet does not exist', async () => {
    const call = await connect(false);
    for (const name of ['bmi-nested', 'shared-cart']) await call('get_example', { name });
    const third = await call('get_example', { name: 'routing-view' });
    expect(third).toContain('run your typecheck and build and fix what they report.');
    expect(third).not.toContain('check_snippet');
  });
});
