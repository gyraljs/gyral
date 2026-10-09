// `Key: true` in the intent table sends `{ _tag: 'Key' }` (ADR 0001 addendum, gyral-1zd.20),
// only for a variant with no field besides `_tag`; `intent` and `update` are optional when a
// component needs neither. Type checks run under `pnpm typecheck`; the rest in Chromium.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { define, html, intentsOf, settled, type IntentNames } from '../src/index.js';

type Deal = { readonly _tag: 'Deal' };
type Bet = { readonly _tag: 'Bet'; readonly amount: number };
type Note = { readonly _tag: 'Note'; readonly text?: string };
type Msg = Deal | Bet | Note;
type State = { readonly deals: number; readonly bet: number };

afterEach(() => {
  document.body.replaceChildren();
});

describe('tag-only intents: types', () => {
  it('allows true for a field-less variant and names the rule otherwise', () => {
    const C = define<State, Msg>()('test-tag-only-types', {
      init: () => ({ deals: 0, bet: 0 }),
      intent: {
        Deal: true,
        Bet: ({ value }) => ({ _tag: 'Bet', amount: Number(value) }),
        // @ts-expect-error: Note has an optional field, so it needs a parser
        Note: true,
      },
      update: {
        Deal: (s) => ({ ...s, deals: s.deals + 1 }),
        Bet: (s, m) => ({ ...s, bet: m.amount }),
        Note: (s) => s,
      },
      view: (_s, i) => {
        expectTypeOf(i).toEqualTypeOf<IntentNames<'Deal' | 'Bet' | 'Note'>>();
        return html`<button data-intent=${i.Deal}>Deal</button>`;
      },
    });
    // Rows get the same names, `true` entries included.
    expectTypeOf(intentsOf<typeof C>()).toEqualTypeOf<IntentNames<'Deal' | 'Bet' | 'Note'>>();
    expect(C.tagName).toBe('test-tag-only-types');
  });

  it('rejects true for a field variant and for a name that is not a tag', () => {
    define<State, Msg>()('test-tag-only-errors', {
      init: () => ({ deals: 0, bet: 0 }),
      intent: {
        // @ts-expect-error: Bet carries `amount`
        Bet: true,
        // @ts-expect-error: Shuffle is not a message tag, so it must return a message
        Shuffle: true,
      },
      update: { Deal: (s) => s, Bet: (s) => s, Note: (s) => s },
      // Name both, so only the types are under test here.
      view: (_s, i) => html`<b data-intent=${i.Bet}></b><b data-intent=${i.Shuffle}></b>`,
    });
  });

  it('makes intent and update optional for a component without messages', () => {
    const Badge = define<{ readonly label: string }>()('test-tag-only-badge', {
      init: () => ({ label: 'new' }),
      view: (s) => html`<span>${s.label}</span>`,
    });
    expectTypeOf(new Badge().state.label).toEqualTypeOf<string>();
  });

  it('still requires an exhaustive update when there are messages', () => {
    // @ts-expect-error: update is required (and must cover Deal, Bet and Note)
    define<State, Msg>()('test-tag-only-no-update', {
      init: () => ({ deals: 0, bet: 0 }),
      intent: { Deal: true },
      view: () => html``,
    });
  });
});

describe('tag-only intents: runtime', () => {
  it('sends the tag for a true entry', async () => {
    define<State, Msg>()('test-tag-only-run', {
      init: () => ({ deals: 0, bet: 0 }),
      intent: { Deal: true, Bet: ({ value }) => ({ _tag: 'Bet', amount: Number(value) }) },
      update: {
        Deal: (s) => ({ ...s, deals: s.deals + 1 }),
        Bet: (s, m) => ({ ...s, bet: m.amount }),
        Note: (s) => s,
      },
      view: (s, i) => html`
        <button id="deal" data-intent=${i.Deal}>Deal</button>
        <button id="bet" value="5" data-intent=${i.Bet}>Bet</button>
        <output>${s.deals}:${s.bet}</output>
      `,
    });
    const el = document.createElement('test-tag-only-run');
    document.body.append(el);
    await settled();
    const $ = (sel: string): HTMLElement => {
      const found = el.shadowRoot?.querySelector<HTMLElement>(sel);
      if (found == null) throw new Error(`no ${sel}`);
      return found;
    };
    $('#deal').click();
    $('#deal').click();
    $('#bet').click();
    await settled();
    expect($('output').textContent).toBe('2:5');
  });

  it('renders a component with neither intent nor update', async () => {
    define<{ readonly label: string }>()('test-tag-only-pure', {
      init: () => ({ label: 'ready' }),
      view: (s) => html`<span>${s.label}</span>`,
    });
    const el = document.createElement('test-tag-only-pure');
    document.body.append(el);
    await settled();
    expect(el.shadowRoot?.querySelector('span')?.textContent).toBe('ready');
  });
});
