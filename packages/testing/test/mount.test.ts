// mount() and parse() (gyral-1zd.25): a component in the document with drivers set before it
// connects, shadow-root queries, typing and clicking that wait for the result, and parsers
// called directly with typed input and context.
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { command, defineDriver, define, html, prop } from '@gyral/core';
import { fakeDriver, mount, parse, type Mounted } from '../src/index.js';

interface State {
  readonly text: string;
  readonly saved: string | undefined;
}
type Msg =
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Save' }
  | { readonly _tag: 'Saved'; readonly id: string };

const save = defineDriver<string, string>({
  name: 'save',
  run: () => Promise.reject(new Error('the real driver must not run in tests')),
});

const Note = define<State, Msg, { label: string }>()('mount-note', {
  props: { label: prop.string({ default: 'Note' }) },
  init: () => ({ text: '', saved: undefined }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', text: value ?? '' }),
    Save: ({ key }, { state }) =>
      key === 'Enter' && state.text === '' ? undefined : { _tag: 'Save' },
  },
  update: {
    Typed: (s, m) => ({ ...s, text: m.text }),
    Save: (s) => [s, [command(save, s.text, { onSuccess: (id): Msg => ({ _tag: 'Saved', id }) })]],
    Saved: (s, m) => ({ ...s, saved: m.id }),
  },
  view: (s, i, { props }) => html`
    <label
      >${props.label} <input name="text" data-intent=${i.Typed} data-intent-on="input"
    /></label>
    <button data-intent=${i.Save}>Save</button>
    <p class="saved">${s.saved ?? ''}</p>
  `,
});

describe('mount', () => {
  let current: Mounted<HTMLElement> | undefined;
  afterEach(() => {
    current?.dispose();
  });

  it('sets props and drivers before the first render, and queries the shadow root', async () => {
    const fake = fakeDriver(save, { impl: (text) => `id-${text}` });
    const m = await mount(Note, { props: { label: 'Title' }, drivers: { save: fake } });
    current = m;
    expectTypeOf(m.el).toEqualTypeOf<InstanceType<typeof Note>>();
    expect(m.$('label')?.textContent).toContain('Title');
    await m.type('input', 'hello');
    expect(m.el.state.text).toBe('hello');
    await m.click('button');
    expect(fake.inputs).toEqual(['hello']);
    expect(m.$('.saved')?.textContent).toBe('id-hello');
    expect(m.$$('p')).toHaveLength(1);
  });

  it('mounts by tag name, with attributes', async () => {
    const m = await mount('mount-note', { attrs: { label: 'From an attribute' } });
    current = m;
    expect(m.$('label')?.textContent).toContain('From an attribute');
  });

  it('says which selector matched nothing', async () => {
    const m = await mount(Note);
    current = m;
    await expect(m.click('.missing')).rejects.toThrow(
      'no element matches ".missing" in <mount-note>',
    );
  });

  it('dispose removes the element', async () => {
    const m = await mount(Note);
    m.dispose();
    expect(m.el.isConnected).toBe(false);
  });
});

describe('parse', () => {
  it('calls a parser with typed input; state defaults to the initial state', () => {
    expect(parse(Note, 'Typed', { value: 'x' })).toEqual({ _tag: 'Typed', text: 'x' });
    // Enter on an empty note declines (undefined); with text it saves.
    expect(parse(Note, 'Save', { key: 'Enter' })).toBeUndefined();
    expect(
      parse(Note, 'Save', { key: 'Enter' }, { state: { text: 'a', saved: undefined } }),
    ).toEqual({
      _tag: 'Save',
    });
    // A `Key: true` entry just sends its tag.
    const Pinger = define<{ readonly n: number }, { readonly _tag: 'Ping' }>()('mount-pinger', {
      init: () => ({ n: 0 }),
      intent: { Ping: true },
      update: { Ping: (s) => ({ n: s.n + 1 }) },
      view: (s, i) => html`<button data-intent=${i.Ping}>${s.n}</button>`,
    });
    expect(parse(Pinger, 'Ping')).toEqual({ _tag: 'Ping' });
    // @ts-expect-error: not one of the component's intents
    expect(() => parse(Note, 'Nope', {})).toThrow('no intent "Nope"');
  });
});
