// gyral/prefer-built-in (@gyral/core/eslint, gyral-337.4): hand-written versions of what Gyral has
// built in, as warnings naming the built-in. Precision before recall: each block's valid cases
// are look-alikes the check must leave alone.
import { describe, expect, it } from 'vitest';
import gyral from '../../src/eslint/index.js';
import { preferBuiltInRule } from '../../src/eslint/prefer-built-in-rule.js';
import { tester, tsTester } from './helpers.js';

const IMPORT =
  "import { define, defineDriver, defineHook, form, html, on, provideDrivers, subscription } from '@gyral/core';\n";

/** A component whose `X` intent is `body`, bound by the markup `bind`. */
const parser = (body: string, bind = '<input type="range" data-intent=${i.X}>'): string =>
  `${IMPORT}define()('x-a', {
  init: () => ({}),
  intent: { X: ${body} },
  update: { X: (s) => s },
  view: (s, i) => html\`${bind}\`,
});
`;

const on = (messageId: string, event: string) => ({ messageId, data: { event } });

describe('gyral/prefer-built-in', () => {
  it('is a warning in the recommended config', () => {
    expect(gyral.rules['prefer-built-in']).toBe(preferBuiltInRule);
    expect(gyral.configs.recommended.rules?.['gyral/prefer-built-in']).toBe('warn');
  });

  tester.run('showModal', preferBuiltInRule, {
    valid: [
      // Not a Gyral module.
      "document.querySelector('dialog').showModal();",
      // close() on a WebSocket and on a dialog, and showModal named in a string.
      `${IMPORT}const socket = new WebSocket('/feed');\nsocket.close();\ndocument.querySelector('dialog').close();\ncall('dialog', 'showModal');`,
    ],
    invalid: [
      {
        code: `${IMPORT}export const modal = defineHook({ client: (el, open) => { if (open) el.showModal(); else el.close(); } });`,
        errors: [{ messageId: 'showModal' }],
      },
      {
        code: `${IMPORT}export const open = defineDriver({ name: 'open', run: () => document.querySelector('dialog')?.showModal() });`,
        errors: [{ messageId: 'showModal' }],
      },
    ],
  });

  tester.run('focus', preferBuiltInRule, {
    valid: [
      // Outside a driver: a hook, a plain function.
      `${IMPORT}export const autofocus = defineHook({ client: (el) => el.focus() });\nexport const go = (el) => el.focus();`,
      // A window's focus (a popup's, a frame's), which focus(selector) can't do.
      `${IMPORT}defineDriver({ name: 'popup', run: (url) => { const popup = window.open(url); popup.focus(); window.focus(); frame.contentWindow.focus(); } });`,
      // Not Gyral's defineDriver, and provide() in a module without Gyral (Vue's app.provide).
      "import { defineDriver } from 'elsewhere';\ndefineDriver({ run: (s) => document.querySelector(s).focus() });",
      'app.provide((s) => document.querySelector(s).focus());',
    ],
    invalid: [
      {
        code: `${IMPORT}defineDriver({ name: 'focus', run: (selector) => { document.querySelector(selector)?.focus(); } });`,
        errors: [{ messageId: 'focus' }],
      },
      {
        // A method, focusing in a nested callback.
        code: `${IMPORT}defineDriver({ name: 'focus', run(id) { requestAnimationFrame(() => document.getElementById(id).focus()); } });`,
        errors: [{ messageId: 'focus' }],
      },
      {
        // token.provide(run), and a run bound in the module.
        code: `${IMPORT}const field = defineDriver('field');\nexport const live = field.provide((s) => { document.querySelector(s).focus({ preventScroll: true }); });\nfunction run(s) { document.querySelector(s).focus(); }\ndefineDriver({ name: 'f', run });`,
        errors: [{ messageId: 'focus' }, { messageId: 'focus' }],
      },
    ],
  });

  tester.run('jsonProp', preferBuiltInRule, {
    valid: [
      // A fetch response, and a plain string.
      `${IMPORT}defineDriver({ name: 'load', run: async (url) => JSON.parse(await (await fetch(url)).text()) });\nexport const read = (raw) => JSON.parse(raw);`,
      // The intent's element, a hook's element and a <meta> carry view data, not props.
      parser(
        "({ target }) => ({ _tag: 'X', row: JSON.parse(target.getAttribute('data-row')) })",
        '<button data-intent=${i.X}>go</button>',
      ),
      `${IMPORT}defineHook({ client: (el) => draw(JSON.parse(el.dataset.points)) });\nconst config = JSON.parse(document.querySelector('meta[name=config]').getAttribute('content'));`,
      // Not a Gyral module; another parameter of attributeChangedCallback.
      "class A extends HTMLElement { get x() { return JSON.parse(this.getAttribute('x')); } }",
      `${IMPORT}class B extends HTMLElement { attributeChangedCallback(name) { JSON.parse(name); } }`,
    ],
    invalid: [
      {
        code: `${IMPORT}define()('x-a', { init: () => ({ items: [] }), update: { Load: (s, m, ctx) => ({ items: JSON.parse(ctx.props.items ?? '[]') }) }, view: (s, i, { props }) => html\`<p>\${JSON.parse(props.items).length}</p>\` });`,
        errors: [{ messageId: 'jsonProp' }, { messageId: 'jsonProp' }],
      },
      {
        // A hand-written element: its own attribute, dataset and attributeChangedCallback.
        code: `${IMPORT}class Chart extends HTMLElement {
  get points() { return JSON.parse(this.getAttribute('points') ?? '[]'); }
  get series() { return JSON.parse(this.dataset.series); }
  attributeChangedCallback(name, old, value) { this.range = JSON.parse(value); }
}`,
        errors: [{ messageId: 'jsonProp' }, { messageId: 'jsonProp' }, { messageId: 'jsonProp' }],
      },
    ],
  });

  tester.run('subscriptionEquals', preferBuiltInRule, {
    valid: [
      // A comparison that guards fail(), not emit; a WebSocket closed on release.
      `${IMPORT}subscription('feed', (emit, { fail }) => {
  let lastCode = 0;
  const socket = new WebSocket('/feed');
  socket.addEventListener('close', (e) => { if (e.code !== lastCode) { lastCode = e.code; fail(e); } });
  socket.addEventListener('message', (e) => emit(e.data));
  return () => socket.close();
});`,
      // Filters, not dedupes: a constant, the subscription's input.
      `${IMPORT}subscription('feed', (emit) => socket.on('message', (e) => { if (e.data === 'ping') return; emit(e.data); }));
subscription('unread', (emit, { input: room }) => feed.subscribe((m) => { if (m.room === room) emit(m.count); }));`,
      // Already given equals; not Gyral's subscription.
      `${IMPORT}subscription('n', (emit) => { let last; return store.subscribe(() => { const n = store.get(); if (n === last) return; last = n; emit(n); }); }, { equals: Object.is });`,
      "import { subscription } from 'elsewhere';\nsubscription('n', (emit) => { let last; return store.subscribe((n) => { if (n !== last) { last = n; emit(n); } }); });",
    ],
    invalid: [
      {
        // An early return before the emit.
        code: `${IMPORT}subscription('n', (emit) => {
  let last;
  return store.subscribe(() => {
    const next = store.getState();
    if (next === last) return;
    last = next;
    emit(next);
  });
});`,
        errors: [{ messageId: 'subscriptionEquals', line: 6 }],
      },
      {
        // JSON.stringify equality, the emit in the branch.
        code: `${IMPORT}subscription('n', (emit) => {
  let json = '';
  return store.subscribe(() => {
    const value = store.getState();
    if (JSON.stringify(value) !== json) { json = JSON.stringify(value); emit(value); }
  });
});`,
        errors: [{ messageId: 'subscriptionEquals' }],
      },
      {
        // Object.is against a remembered member, from a token.
        code: `${IMPORT}const feed = defineDriver('feed');\nsubscription(feed, (emit) => { const seen = { last: undefined }; return store.subscribe((v) => { if (!Object.is(seen.last, v)) { seen.last = v; emit(v); } }); });`,
        errors: [{ messageId: 'subscriptionEquals' }],
      },
    ],
  });

  const ROUTER = `${IMPORT}import { makeRouter } from '@gyral/router';\n`;
  tester.run('driverList', preferBuiltInRule, {
    valid: [
      { code: `${ROUTER}provideDrivers(document.body, [makeRouter()]);`, filename: 'src/main.js' },
      // Records of fakes in tests.
      {
        code: `${ROUTER}provideDrivers(document.body, { router: makeRouter() });`,
        filename: 'src/app.test.js',
      },
      { code: `${ROUTER}el.drivers = { router: makeRouter() };`, filename: 'test/app.js' },
      { code: `${ROUTER}el.drivers = { router: makeRouter() };`, filename: 'src/app.spec.ts' },
      { code: `${ROUTER}el.drivers = { router: makeRouter() };`, filename: 'tests/e2e/app.js' },
      // Not an object literal, and not a Gyral module.
      { code: `${ROUTER}provideDrivers(document.body, drivers);`, filename: 'src/main.js' },
      { code: 'el.drivers = { http };', filename: 'src/main.js' },
    ],
    invalid: [
      {
        code: `${ROUTER}provideDrivers(document.body, { router: makeRouter({ captureLinks: true }) });`,
        filename: 'src/main.js',
        errors: [{ messageId: 'driverList' }],
      },
      {
        code: `${ROUTER}const el = document.querySelector('my-app');\nel.drivers = { router: makeRouter() };`,
        filename: 'src/latest.js',
        errors: [{ messageId: 'driverList' }],
      },
    ],
  });

  tester.run('on() for intent parsers', preferBuiltInRule, {
    valid: [
      // on() parsers are left alone: input.modifiers, even the event's own fields.
      parser(
        "on('keydown', (input) => (input.modifiers.ctrl || input.event.altKey ? undefined : { _tag: 'X' }))",
        '<div tabindex="0" data-intent-keydown=${i.X}></div>',
      ),
      // Several events, so not one on(): two bindings, a data-intent-on list, two names, a switch.
      parser(
        "({ event }) => (event instanceof KeyboardEvent && !event.altKey ? { _tag: 'X' } : undefined)",
        '<div data-intent-keydown=${i.X} data-intent-keyup=${i.X}></div>',
      ),
      parser(
        "({ event }) => (event.ctrlKey && event.type === 'keyup' ? { _tag: 'X' } : undefined)",
        '<div data-intent=${i.X} data-intent-on="keydown keyup"></div>',
      ),
      parser(
        "({ event }) => (event.type === 'pointerdown' || event.type === 'pointerup') && event.shiftKey ? { _tag: 'X' } : undefined",
        '<div data-intent=${i.X}></div>',
      ),
      parser(
        "({ event }) => { switch (event.type) { case 'dragenter': return event instanceof DragEvent ? { _tag: 'X' } : undefined; } }",
        '<div data-intent=${i.X}></div>',
      ),
      // valueAsNumber exists only for number, range, date and time inputs.
      parser(
        "({ value }) => ({ _tag: 'X', n: Number(value) })",
        '<button value="3" data-intent=${i.X}>3</button>',
      ),
      parser(
        "({ value }) => ({ _tag: 'X', n: Number(value) })",
        '<input type="range" data-intent=${i.X}><select data-intent=${i.X}></select>',
      ),
      parser(
        "(input) => ({ _tag: 'X', n: Number(input.value) })",
        '<input type=${s.kind} data-intent=${i.X}>',
      ),
      parser("({ value }) => ({ _tag: 'X', n: Number(value) })", '<p>bound elsewhere</p>'),
      // A form() callback gets data, not the input; the target's type isn't the event's.
      parser(
        "form(schema, (data) => ({ _tag: 'X', n: Number(data.value) }))",
        '<form data-intent=${i.X}></form>',
      ),
      parser(
        "({ target }) => (target.type === 'checkbox' ? { _tag: 'X' } : undefined)",
        '<input type="checkbox" data-intent=${i.X}>',
      ),
      // Not a parser: a hook; not Gyral's define.
      `${IMPORT}defineHook({ client: (el) => el.addEventListener('keydown', (e) => { if (e instanceof KeyboardEvent && e.ctrlKey) e.preventDefault(); }) });`,
      "import { define } from 'elsewhere';\ndefine()('x', { intent: { X: ({ event }) => event instanceof KeyboardEvent } });",
    ],
    invalid: [
      {
        // undo-replay's Ctrl+Z shortcut: one event, told apart and filtered by hand.
        code: parser(
          "({ event, key }) => { if (!(event instanceof KeyboardEvent) || !(event.ctrlKey || event.metaKey)) return; return key === 'z' ? { _tag: 'X' } : undefined; }",
          '<div class="editor" data-intent=${i.X} data-intent-on="keydown"></div>',
        ),
        errors: [on('onEvent', 'keydown'), on('onModifiers', 'keydown')],
      },
      {
        code: parser(
          "(input) => (input.event.type !== 'keydown' ? undefined : { _tag: 'X' })",
          '<div tabindex="0" data-intent-keydown=${i.X}></div>',
        ),
        errors: [on('onEvent', 'keydown')],
      },
      {
        // The event read through an alias; the default trigger names the event.
        code: parser(
          "function (input) { const e = input.event; return e instanceof MouseEvent && e.button === 0 ? { _tag: 'X' } : undefined; }",
          '<button type="button" data-intent=${i.X}>go</button>',
        ),
        errors: [on('onEvent', 'click')],
      },
      {
        code: parser(
          "({ event }) => { const { shiftKey } = event; return { _tag: 'X', extend: shiftKey }; }",
          '<li data-intent=${i.X}></li>',
        ),
        errors: [on('onModifiers', 'click')],
      },
      {
        code: parser("({ value }) => ({ _tag: 'X', n: Number(value) })"),
        errors: [on('onNumber', 'input')],
      },
      {
        code: parser(
          "(input) => ({ _tag: 'X', n: +input.value })",
          '<input type="number" data-intent-change=${i.X}>',
        ),
        errors: [on('onNumber', 'change')],
      },
      {
        code: parser(
          "(input) => { const { value = '' } = input; return { _tag: 'X', a: parseInt(input.value ?? '', 10), b: Number.parseFloat(value) }; }",
        ),
        errors: [on('onNumber', 'input')],
      },
      {
        code: parser(
          "(input) => { const el = input.event.composedPath()[0]; return el instanceof HTMLElement ? { _tag: 'X' } : undefined; }",
          '<button data-intent=${i.X}>go</button>',
        ),
        errors: [on('onOrigin', 'click')],
      },
      {
        // A parser bound in the module, read with .at(0); no binding: the event is unknown.
        code: `${IMPORT}const pick = ({ event }) => (event.composedPath().at(0) === undefined ? undefined : { _tag: 'X' });\ndefine()('x-a', { init: () => ({}), intent: { X: pick }, update: { X: (s) => s }, view });`,
        errors: [on('onOrigin', '<event>')],
      },
    ],
  });

  tsTester.run('TypeScript', preferBuiltInRule, {
    valid: [
      // A type-only import doesn't make a Gyral module.
      "import type { Driver } from '@gyral/core';\ndocument.querySelector('dialog')!.showModal();",
    ],
    invalid: [
      {
        code: parser(
          "(input) => ((input.event as KeyboardEvent).ctrlKey ? undefined : { _tag: 'X', n: Number(input.value!) })",
          '<input type="number" data-intent=${i.X}>',
        ),
        errors: [on('onModifiers', 'input'), on('onNumber', 'input')],
      },
    ],
  });
});
