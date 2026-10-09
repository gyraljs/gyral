// Per-event intent attributes (gyral-dyn.15, view/05-element.md "Per-event intents"):
// `data-intent-<event>=${i.Msg}` names the intent for one event type, before the element's
// plain `data-intent`; the root listens for the event types in the attribute names.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, each, html, intentsOf, raw, settled, type TemplateResult } from '../src/index.js';
import { eventsOf } from '../src/intent.js';
import { normalize } from '../src/view/index.js';

interface Card {
  readonly id: string;
}
interface State {
  readonly cards: readonly Card[];
  readonly log: readonly string[];
}
type Msg =
  | { readonly _tag: 'Grab'; readonly id: string }
  | { readonly _tag: 'Drop'; readonly id: string }
  | { readonly _tag: 'Pick'; readonly id: string }
  | { readonly _tag: 'Key'; readonly key: string }
  | { readonly _tag: 'Enter' }
  | { readonly _tag: 'Raw' };

// Rows take the component's intent names; the row's return type breaks the inference circle.
const i = intentsOf<typeof Table>();
const idOf = (el: Element): string => el.getAttribute('data-id') ?? '';

// A pure row: two per-event intents and a plain click intent on one element.
const CardRow = (c: Card): TemplateResult =>
  html`<li
    data-id=${c.id}
    data-intent-pointerdown=${i.Grab}
    data-intent-pointerup=${i.Drop}
    data-intent=${i.Pick}
  >
    <span>${c.id}</span>
  </li>`;

const Table = define<State, Msg>()('test-per-event', {
  init: () => ({ cards: [{ id: 'a' }, { id: 'b' }], log: [] }),
  intent: {
    Grab: ({ target }) => ({ _tag: 'Grab', id: idOf(target) }),
    Drop: ({ target }) => ({ _tag: 'Drop', id: idOf(target) }),
    Pick: ({ target }) => ({ _tag: 'Pick', id: idOf(target) }),
    Key: ({ key }) => (key === undefined ? undefined : { _tag: 'Key', key }),
    Enter: () => ({ _tag: 'Enter' }),
    // eslint-disable-next-line gyral/unused-intent -- named in raw() markup, which the rule skips
    Raw: () => ({ _tag: 'Raw' }),
  },
  update: {
    Grab: (s, m) => ({ ...s, log: [...s.log, `grab:${m.id}`] }),
    Drop: (s, m) => ({ ...s, log: [...s.log, `drop:${m.id}`] }),
    Pick: (s, m) => ({ ...s, log: [...s.log, `pick:${m.id}`] }),
    Key: (s, m) => ({ ...s, log: [...s.log, `key:${m.key}`] }),
    Enter: (s) => ({ ...s, log: [...s.log, 'enter'] }),
    Raw: (s) => ({ ...s, log: [...s.log, 'raw'] }),
  },
  view: (s, i) => html`
    <ul data-intent-keydown=${i.Key} data-intent-focusin=${i.Enter} tabindex="0">
      ${each(s.cards, (c) => c.id, CardRow)}
    </ul>
    ${raw('<p data-intent-dblclick="Raw">raw</p>')}
  `,
});

type TableElement = HTMLElement & { readonly state: State };

let added: string[] = [];

async function mount() {
  const spy = vi.spyOn(ShadowRoot.prototype, 'addEventListener');
  const el = new Table() as TableElement;
  document.body.append(el);
  await settled();
  added = spy.mock.calls.map((call) => call[0]);
  spy.mockRestore();
  const $ = (sel: string): Element => {
    const found = el.shadowRoot?.querySelector(sel);
    if (found == null) throw new Error(sel);
    return found;
  };
  return { el, $ };
}

const fire = (target: Element, event: Event): void => {
  target.dispatchEvent(event);
};
const init = { bubbles: true, composed: true };

afterEach(() => {
  document.body.replaceChildren();
});

describe('per-event intents', () => {
  it('listens for the events in the attribute names, bound, static and in raw()', async () => {
    await mount();
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'focusin', 'dblclick']) {
      expect(added).toContain(type);
    }
  });

  it('a per-event intent wins over the plain data-intent for its event only', async () => {
    const { el, $ } = await mount();
    const span = $('li[data-id=b] span'); // hit inside the row: the row is the intent element
    fire(span, new PointerEvent('pointerdown', init));
    fire(span, new PointerEvent('pointerup', init));
    fire(span, new MouseEvent('click', init));
    await settled();
    expect(el.state.log).toEqual(['grab:b', 'drop:b', 'pick:b']);
  });

  it('an event the row has no intent for reaches the nearest ancestor that has one', async () => {
    const { el, $ } = await mount();
    fire($('li[data-id=a]'), new KeyboardEvent('keydown', { ...init, key: 'Enter' }));
    fire($('li[data-id=a]'), new FocusEvent('focusin', init));
    fire($('p'), new MouseEvent('dblclick', init));
    await settled();
    expect(el.state.log).toEqual(['key:Enter', 'enter', 'raw']);
  });

  it('collects per-event names from parts and markup, and data-intent-on lists', () => {
    const template = normalize([
      '<a data-intent-click=',
      ' data-intent-on="keyup focusout" data-intent="X" data-intent-gyral-output=\'Y\'></a>',
    ]);
    expect([...eventsOf(template)].sort()).toEqual(['click', 'focusout', 'gyral-output', 'keyup']);
  });

  it('reads every static per-event attribute when they sit next to each other', () => {
    const adjacent = (html: string) => [...eventsOf(normalize([html]))].sort();
    expect(adjacent('<b data-intent-pointerdown="Down" data-intent-pointerup="Up"></b>')).toEqual([
      'pointerdown',
      'pointerup',
    ]);
    expect(
      adjacent('<b data-intent-on="click" data-intent-keydown=K data-intent-keyup=\'U\'>'),
    ).toEqual(['click', 'keydown', 'keyup']);
    expect(adjacent('<b data-intent-pointerdown=D data-intent-pointerup=U/>')).toEqual([
      'pointerdown',
      'pointerup',
    ]);
  });

  it('adjacent static per-event attributes in raw() markup both fire', async () => {
    const Adjacent = define<State, Msg>()('test-per-event-adjacent', {
      init: () => ({ cards: [], log: [] }),
      intent: {
        Grab: () => ({ _tag: 'Grab', id: 'raw' }),
        Drop: () => ({ _tag: 'Drop', id: 'raw' }),
      },
      update: {
        Grab: (s, m) => ({ ...s, log: [...s.log, `grab:${m.id}`] }),
        Drop: (s, m) => ({ ...s, log: [...s.log, `drop:${m.id}`] }),
        Pick: (s) => s,
        Key: (s) => s,
        Enter: (s) => s,
        Raw: (s) => s,
      },
      view: () =>
        html`${raw('<p data-intent-pointerdown="Grab" data-intent-pointerup="Drop">p</p>')}`,
    });
    const el = new Adjacent() as TableElement;
    document.body.append(el);
    await settled();
    const p = el.shadowRoot?.querySelector('p');
    if (p == null) throw new Error('p');
    fire(p, new PointerEvent('pointerdown', init));
    fire(p, new PointerEvent('pointerup', init));
    await settled();
    expect(el.state.log).toEqual(['grab:raw', 'drop:raw']);
  });
});
