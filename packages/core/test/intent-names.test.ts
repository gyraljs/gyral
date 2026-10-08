// Intent names that are not message tags (ADR 0001 "Intent names"): a component lists them in
// its message union with `IntentName<…>`; each is a required `intent` key whose parser may
// return any message, a name in the view's `i` and in `intents<Msg>()`, and needs no reducer.
// Tag keys keep returning their variant. The type checks run under `pnpm typecheck` (tsc covers
// tests); the document table runs in Chromium.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  define,
  each,
  html,
  intents,
  prop,
  settled,
  type IntentInput,
  type IntentName,
  type IntentNames,
  type Messages,
} from '../src/index.js';

// ---- Type tests -------------------------------------------------------------------------

type Request = { readonly _tag: 'Request'; readonly action: string; readonly id?: number };
type Answered = { readonly _tag: 'Answered'; readonly ok: boolean };
type TMsg = Request | Answered | IntentName<'Archive' | 'Restore'>;

describe('IntentName types', () => {
  it('keeps real messages apart from intent names', () => {
    expectTypeOf<Messages<TMsg>>().toEqualTypeOf<Request | Answered>();
    expectTypeOf<IntentNames<TMsg>>().toEqualTypeOf<{
      readonly Request: 'Request';
      readonly Answered: 'Answered';
      readonly Archive: 'Archive';
      readonly Restore: 'Restore';
    }>();
  });

  it('type-checks parsers, reducers, the view and props in ctx', () => {
    define<{ readonly n: number }, TMsg, { readonly folder: string }>('test-names-types', {
      props: { folder: prop.string({ default: 'inbox' }) },
      init: () => ({ n: 0 }),
      intent: {
        // A non-tag key may return any message; input and ctx keep their types.
        Archive: (input, { props }) => {
          expectTypeOf(input).toEqualTypeOf<IntentInput>();
          expectTypeOf(props.folder).toEqualTypeOf<string>();
          return { _tag: 'Request', action: `archive:${props.folder}`, id: Number(input.value) };
        },
        Restore: () => ({ _tag: 'Answered', ok: true }),
        // A tag key still returns its own variant.
        // @ts-expect-error: the Request parser must return a Request
        Request: () => ({ _tag: 'Answered', ok: true }), // eslint-disable-line gyral/unused-intent
      },
      update: {
        Request: (s) => s,
        Answered: (s, m) => ({ n: m.ok ? s.n + 1 : s.n }),
        // No reducer for Archive/Restore: they are never dispatched.
      },
      view: (_s, i) => html`
        <button data-intent=${i.Archive}>Archive</button>
        <button data-intent-pointerdown=${i.Restore}>Restore</button>
      `,
    });
    // A typo in the view fails like any unknown name.
    const i = intents<TMsg>();
    // @ts-expect-error: 'Archvie' is not an intent name
    expect(i.Archvie).toBe('Archvie'); // the runtime proxy answers; the types refuse
    expectTypeOf(i.Archive).toEqualTypeOf<'Archive'>();
  });

  it('requires a parser for every intent name, and no reducer for one', () => {
    define<{ readonly n: number }, TMsg>('test-names-missing', {
      init: () => ({ n: 0 }),
      // @ts-expect-error: Restore has no parser
      intent: { Archive: () => ({ _tag: 'Answered', ok: true }) },
      update: { Request: (s) => s, Answered: (s) => s },
      view: () => html``,
    });
    define<{ readonly n: number }, TMsg>('test-names-reducer', {
      init: () => ({ n: 0 }),
      intent: {
        Archive: () => ({ _tag: 'Answered', ok: true }),
        Restore: () => ({ _tag: 'Answered', ok: true }),
      },
      update: {
        Request: (s) => s,
        Answered: (s) => s,
        // @ts-expect-error: intent names get no reducer
        Archive: (s: { readonly n: number }) => s,
      },
      view: () => html``,
    });
  });

  it('cannot build an intent name, so none is ever sent or produced by a command', () => {
    // @ts-expect-error: the brand is a unique symbol no module exports
    const name: IntentName<'Archive'> = { _tag: 'Archive' };
    expect(name._tag).toBe('Archive');
  });
});

// ---- A document table: seven controls, one request message ------------------------------

type Doc = { readonly id: number; readonly title: string; readonly archived: boolean };
type Action =
  | { readonly kind: 'archive'; readonly id: number }
  | { readonly kind: 'restore'; readonly id: number }
  | { readonly kind: 'star'; readonly id: number }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'sort'; readonly by: string }
  | { readonly kind: 'page-size'; readonly size: string }
  | { readonly kind: 'rename'; readonly title: string };

/** Seven intents, one message: every control only sends a request to the server. */
type TableMsg =
  | { readonly _tag: 'Send'; readonly action: Action }
  | IntentName<
      'Archive' | 'Restore' | 'Star' | 'Duplicate' | 'SortBy' | 'PageSize' | 'RenameFolder'
    >;

interface Table {
  readonly docs: readonly Doc[];
  readonly sent: readonly Action[];
}

// Rows name intents through a module constant, which follows the same union.
const ti = intents<TableMsg>();

const DocRow = (doc: Doc) =>
  html`<li data-doc=${doc.id}>
    ${doc.title}
    <button type="button" data-intent=${doc.archived ? ti.Restore : ti.Archive}>
      ${doc.archived ? 'Restore' : 'Archive'}
    </button>
    <input type="checkbox" aria-label="Star" data-intent=${ti.Star} />
  </li>`;

const docOf = (target: Element): number =>
  Number(target.closest('[data-doc]')?.getAttribute('data-doc'));
// Helpers that build messages return Messages<TableMsg>: the union without its intent names.
const send = (action: Action): Messages<TableMsg> => ({ _tag: 'Send', action });

const DocTable = define<Table, TableMsg>('test-doc-table', {
  init: () => ({
    docs: [
      { id: 1, title: 'Budget', archived: false },
      { id: 2, title: 'Roadmap', archived: true },
    ],
    sent: [],
  }),
  intent: {
    Archive: ({ target }) => send({ kind: 'archive', id: docOf(target) }),
    Restore: ({ target }) => send({ kind: 'restore', id: docOf(target) }),
    Star: ({ target }) => send({ kind: 'star', id: docOf(target) }),
    Duplicate: () => send({ kind: 'duplicate' }),
    SortBy: ({ value }) => send({ kind: 'sort', by: value ?? '' }),
    PageSize: ({ value }) => send({ kind: 'page-size', size: value ?? '' }),
    RenameFolder: ({ formData }) => {
      const title = formData?.get('title');
      return send({ kind: 'rename', title: typeof title === 'string' ? title : '' });
    },
  },
  // One reducer: in an app it returns the request command; here it records the action.
  update: { Send: (s, m) => ({ ...s, sent: [...s.sent, m.action] }) },
  view: (s, i) => html`
    <ul>
      ${each(s.docs, (doc) => doc.id, DocRow)}
    </ul>
    <select data-intent=${i.SortBy}>
      <option value="title">Title</option>
      <option value="updated">Last updated</option>
    </select>
    <select data-intent=${i.PageSize}>
      <option value="25">25</option>
      <option value="100">100</option>
    </select>
    <form data-intent=${i.RenameFolder}>
      <input name="title" value="Reports" /><button>Rename</button>
    </form>
    <button type="button" data-intent=${i.Duplicate}>Duplicate</button>
  `,
});

type TableElement = HTMLElement & { readonly state: Table };

afterEach(() => {
  document.body.replaceChildren();
});

describe('a document table with intent names', () => {
  it('turns seven intents into one Send message', async () => {
    const el = new DocTable() as TableElement;
    document.body.append(el);
    await settled();
    const root = el.shadowRoot as ShadowRoot;
    const click = (sel: string): void => {
      (root.querySelector(sel) as HTMLElement).click();
    };
    const pick = (sel: string, value: string): void => {
      const select = root.querySelector(sel) as HTMLSelectElement;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
    click('[data-doc="1"] button');
    click('[data-doc="2"] button');
    click('[data-doc="2"] input');
    pick('select[data-intent="SortBy"]', 'updated');
    pick('select[data-intent="PageSize"]', '100');
    (root.querySelector('form') as HTMLFormElement).requestSubmit();
    click('button[data-intent="Duplicate"]');
    await settled();
    expect(el.state.sent).toEqual([
      { kind: 'archive', id: 1 },
      { kind: 'restore', id: 2 },
      { kind: 'star', id: 2 },
      { kind: 'sort', by: 'updated' },
      { kind: 'page-size', size: '100' },
      { kind: 'rename', title: 'Reports' },
      { kind: 'duplicate' },
    ]);
  });
});
