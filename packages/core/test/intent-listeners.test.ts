// A component root listens only for the events its intents can fire on (gyral-g1r.20,
// view/05-element.md "Intent events"): the default triggers, spec.events, and the
// `data-intent-on` values of the templates it renders (all intent events when one is bound).
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  define,
  html,
  nothing,
  raw,
  settled,
  type ChildValue,
  type IntentNames,
} from '../src/index.js';
import { DEFAULT_EVENTS, eventsOf, INTENT_EVENTS } from '../src/intent.js';
import { normalize } from '../src/view/index.js';

interface State {
  readonly open: boolean;
  readonly on: string;
  readonly log: readonly string[];
}
type Msg = { readonly _tag: 'Open' } | { readonly _tag: 'Hit'; readonly type: string };
type View = (s: State, i: IntentNames<Msg>) => ChildValue;

const component = (tag: string, view: View, events?: readonly string[]) =>
  define<State, Msg>(tag, {
    init: () => ({ open: false, on: 'keyup', log: [] }),
    ...(events === undefined ? {} : { events }),
    intent: {
      Open: () => ({ _tag: 'Open' }),
      Hit: ({ event }) => ({ _tag: 'Hit', type: event.type }),
    },
    update: {
      Open: (s) => ({ ...s, open: true }),
      Hit: (s, m) => ({ ...s, log: [...s.log, m.type] }),
    },
    view,
  });

const Plain = component(
  'test-listen-plain',
  (_s, i) => html`<button type="button" data-intent=${i.Open}>open</button>`,
);

const Later = component(
  'test-listen-later',
  (s, i) =>
    html`<button type="button" data-intent=${i.Open}>open</button> ${
        s.open
          ? html`<input data-intent=${i.Hit} data-intent-on="keydown" />
              <p data-intent=${i.Hit} data-intent-on="focusin">x</p>`
          : nothing
      }`,
  ['pointerup'],
);

const Bound = component(
  'test-listen-bound',
  (s, i) => html`<input data-intent=${i.Hit} data-intent-on=${s.on} />`,
);

const Raw = component(
  'test-listen-raw',
  () => html`<div>${raw('<input data-intent="Hit" data-intent-on="keyup">')}</div>`,
);

let added: string[] = [];

/** Mounts `ctor` and records the event types added to shadow roots meanwhile. */
async function mount(ctor: CustomElementConstructor): Promise<HTMLElement> {
  const spy = vi.spyOn(ShadowRoot.prototype, 'addEventListener'); // calls through
  const el = new ctor();
  document.body.append(el);
  await settled();
  added = spy.mock.calls.map((call) => call[0]);
  spy.mockRestore();
  return el;
}

const input = (el: HTMLElement): HTMLInputElement =>
  el.shadowRoot?.querySelector('input') as HTMLInputElement;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('intent listeners (gyral-g1r.20)', () => {
  it('a component without data-intent-on listens for the default triggers only', async () => {
    await mount(Plain);
    expect(added).toEqual([...DEFAULT_EVENTS]);
  });

  it('adds the events of a template when it first renders, and they fire', async () => {
    const el = await mount(Later);
    expect(added).toEqual([...DEFAULT_EVENTS, 'pointerup']);
    (el as unknown as { send(m: Msg): void }).send({ _tag: 'Open' });
    await settled();
    const field = input(el);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true }));
    el.shadowRoot
      ?.querySelector('p')
      ?.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect((el as unknown as { state: State }).state.log).toEqual(['keydown', 'focusin']);
  });

  it('listens for every intent event when data-intent-on is bound', async () => {
    const el = await mount(Bound);
    expect(new Set(added)).toEqual(new Set(INTENT_EVENTS));
    input(el).dispatchEvent(
      new KeyboardEvent('keyup', { key: 'a', bubbles: true, composed: true }),
    );
    expect((el as unknown as { state: State }).state.log).toEqual(['keyup']);
  });

  it('reads data-intent-on in raw() markup', async () => {
    const el = await mount(Raw);
    expect(added).toContain('keyup');
    input(el).dispatchEvent(
      new KeyboardEvent('keyup', { key: 'a', bubbles: true, composed: true }),
    );
    expect((el as unknown as { state: State }).state.log).toEqual(['keyup']);
  });

  it('collects static values in every quoting style, once per template', () => {
    const template = normalize([
      '<a data-intent-on="toggle"></a><b data-intent-on=\'keyup\'></b><i data-intent-on=focusout></i>',
    ]);
    expect(eventsOf(template)).toEqual(['toggle', 'keyup', 'focusout']);
    expect(eventsOf(template)).toBe(eventsOf(template));
  });
});
