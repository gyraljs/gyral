import { afterEach, describe, expect, it } from 'vitest';
import { command, define, defineDriver, html } from '../src/index.js';

interface Props {
  readonly userId: string;
  readonly label: string;
}
interface State {
  readonly draft: string;
  readonly loadedFor: string;
  readonly saved: readonly string[];
  readonly fetched: readonly string[];
}
type Msg =
  | { readonly _tag: 'Edit' }
  | { readonly _tag: 'Save' }
  | { readonly _tag: 'Loaded'; readonly id: string };

const changes: { props: Props; prev: Props }[] = [];
let renders = 0;

const load = defineDriver<string, string>({ name: 'load', run: (id) => id });

const Card = define<State, Msg, Props>('test-card', {
  props: { userId: { type: String }, label: { type: String } },
  init: (props) => ({ draft: '', loadedFor: props.userId, saved: [], fetched: [] }),
  intent: { Save: () => ({ _tag: 'Save' }) },
  update: {
    Edit: (s) => ({ ...s, draft: 'edited' }),
    Save: (s, _m, { props }) => ({ ...s, saved: [...s.saved, `${props.userId}:${s.draft}`] }),
    Loaded: (s, m) => ({ ...s, fetched: [...s.fetched, m.id] }),
    PropsChanged: (s, m) => {
      changes.push({ props: m.props, prev: m.prev });
      if (m.props.userId === m.prev.userId) return s;
      return [
        { ...s, draft: '', loadedFor: m.props.userId },
        [command(load, m.props.userId, { onSuccess: (id) => ({ _tag: 'Loaded', id }) })],
      ];
    },
  },
  view: (s, i, { props }) => {
    renders += 1;
    return html`<h2>${props.label}</h2>
      <p>${s.loadedFor}|${s.draft}</p>
      <button data-intent=${i.Save}>Save</button>`;
  },
});

const Plain = define<{ readonly n: number }, never, { readonly label: string }>('test-plain', {
  props: { label: { type: String } },
  init: () => ({ n: 0 }),
  intent: {},
  update: {},
  view: (_s, _i, { props }) => html`<p>${props.label}</p>`,
});

async function mount(): Promise<InstanceType<typeof Card>> {
  const el = new Card();
  Object.assign(el, { userId: 'u1', label: 'First' });
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const text = (el: Element, sel: string) => el.shadowRoot?.querySelector(sel)?.textContent;

afterEach(() => {
  document.body.replaceChildren();
  changes.length = 0;
  renders = 0;
});

describe('props (ADR 0007)', () => {
  it('reads props as context in view and reducers, without PropsChanged on first render', async () => {
    const el = await mount();
    expect(text(el, 'h2')).toBe('First');
    el.send({ _tag: 'Edit' });
    el.send({ _tag: 'Save' });
    expect(el.state.saved).toEqual(['u1:edited']);
    expect(changes).toEqual([]);
  });

  it('sends PropsChanged once per change and renders the new state in the same pass', async () => {
    const el = await mount();
    el.send({ _tag: 'Edit' });
    await el.updateComplete;
    renders = 0;
    Object.assign(el, { userId: 'u2' });
    await el.updateComplete;
    expect(changes).toHaveLength(1);
    expect(changes[0]?.prev.userId).toBe('u1');
    expect(changes[0]?.props.userId).toBe('u2');
    expect(text(el, 'p')).toBe('u2|');
    expect(renders).toBe(1);
  });

  it('runs commands returned from PropsChanged', async () => {
    const el = await mount();
    Object.assign(el, { userId: 'u3' });
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    expect(el.state.fetched).toEqual(['u3']);
  });

  it('keeps state when an unrelated prop changes', async () => {
    const el = await mount();
    el.send({ _tag: 'Edit' });
    Object.assign(el, { label: 'Second' });
    await el.updateComplete;
    expect(text(el, 'h2')).toBe('Second');
    expect(el.state.draft).toBe('edited');
  });

  it('works without a PropsChanged reducer', async () => {
    const el = new Plain();
    el.setAttribute('label', 'a');
    document.body.append(el);
    await el.updateComplete;
    el.setAttribute('label', 'b');
    await el.updateComplete;
    expect(text(el, 'p')).toBe('b');
  });
});
