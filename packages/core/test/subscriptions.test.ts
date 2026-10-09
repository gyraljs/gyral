// Declarative subscriptions (ADR 0025, view/05-element.md "Subscriptions"): the running set
// follows `subscriptions(state, props)` by lane; moves keep it running, a real removal stops it
// one microtask later, and reattaching starts it again from the current state.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectErrors } from './collect-errors.js';
import { command, define, html, prop, settled, subscription, type Command } from '../src/index.js';

/** Channels with `subscribe(listener) → unsubscribe`, counting live listeners per channel. */
function feed() {
  const values = new Map<string, number>();
  const listeners = new Map<string, Set<() => void>>();
  let starts = 0;
  return {
    get: (channel: string) => values.get(channel) ?? 0,
    set: (channel: string, next: number) => {
      values.set(channel, next);
      for (const listener of [...(listeners.get(channel) ?? [])]) listener();
    },
    subscribe: (channel: string, listener: () => void) => {
      starts += 1;
      const set = listeners.get(channel) ?? new Set();
      listeners.set(channel, set);
      set.add(listener);
      return () => set.delete(listener);
    },
    live: (channel?: string) =>
      channel === undefined
        ? [...listeners.values()].reduce((n, set) => n + set.size, 0)
        : (listeners.get(channel)?.size ?? 0),
    starts: () => starts,
  };
}

const unread = feed();
const unreadDriver = subscription<number, string>('unread', (emit, { input }) => {
  emit(unread.get(input));
  return unread.subscribe(input, () => {
    emit(unread.get(input));
  });
});

type Msg =
  | { readonly _tag: 'Count'; readonly n: number }
  | { readonly _tag: 'Live'; readonly on: boolean }
  | { readonly _tag: 'Channel'; readonly name: string }
  | { readonly _tag: 'Noise' };
interface State {
  readonly n: number;
  readonly live: boolean;
  readonly channel: string;
  readonly noise: number;
}

const watch = (channel: string, key?: string): Command<Msg> =>
  command(unreadDriver, channel, {
    onSuccess: (n): Msg => ({ _tag: 'Count', n }),
    ...(key === undefined ? {} : { key }),
  });

const update = {
  Count: (s: State, m: { readonly n: number }) => ({ ...s, n: m.n }),
  Live: (s: State, m: { readonly on: boolean }) => ({ ...s, live: m.on }),
  Channel: (s: State, m: { readonly name: string }) => ({ ...s, channel: m.name }),
  Noise: (s: State) => ({ ...s, noise: s.noise + 1 }),
};

/** Watches its channel while `live`. */
const Badge = define<State, Msg>()('test-subs-badge', {
  init: () => ({ n: -1, live: true, channel: 'inbox', noise: 0 }),
  subscriptions: (s) => (s.live ? [watch(s.channel)] : []),
  update,
  view: (s) => html`<output>${s.n}</output>`,
});

/** Watches the channel its prop names. */
type CountMsg = Extract<Msg, { _tag: 'Count' }>;
const PropBadge = define<{ readonly n: number }, CountMsg, { channel: string }>()(
  'test-subs-prop',
  {
    props: { channel: prop.string({ default: 'inbox' }) },
    init: () => ({ n: -1 }),
    subscriptions: (_s, p) => [
      command(unreadDriver, p.channel, { onSuccess: (n): CountMsg => ({ _tag: 'Count', n }) }),
    ],
    update: { Count: (s, m) => ({ ...s, n: m.n }) },
    view: (s) => html`<output>${s.n}</output>`,
  },
);

/** Starts its watch from init (not a subscription): a real removal ends it for good. */
const Plain = define<State, Msg>()('test-subs-plain', {
  init: () => [{ n: -1, live: true, channel: 'inbox', noise: 0 }, [watch('inbox')]],
  update,
  view: (s) => html`<output>${s.n}</output>`,
});

/** A parent rendering a Badge, for the nested cases. */
const Panel = define<object, never>()('test-subs-panel', {
  init: () => ({}),
  view: () => html`<test-subs-badge></test-subs-badge>`,
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const text = (el: Element) => el.shadowRoot?.querySelector('output')?.textContent;

afterEach(async () => {
  document.body.replaceChildren();
  await tick();
  vi.restoreAllMocks();
});

describe('subscriptions', () => {
  it('start after the first render and deliver', async () => {
    const el = new Badge();
    document.body.append(el);
    await settled();
    expect(unread.live('inbox')).toBe(1);
    unread.set('inbox', 3);
    await settled();
    expect(text(el)).toBe('3');
  });

  it('stop when the state drops them and start again when it brings them back', async () => {
    const el = new Badge();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Live', on: false });
    expect(unread.live('inbox')).toBe(0);
    el.send({ _tag: 'Live', on: true });
    expect(unread.live('inbox')).toBe(1);
  });

  it('restart when their input changes, and keep running when it does not', async () => {
    const el = new Badge();
    document.body.append(el);
    await settled();
    const starts = unread.starts();
    el.send({ _tag: 'Noise' }); // same lane, same input: nothing restarts
    el.send({ _tag: 'Noise' });
    expect(unread.starts()).toBe(starts);
    el.send({ _tag: 'Channel', name: 'alerts' });
    expect(unread.live('inbox')).toBe(0);
    expect(unread.live('alerts')).toBe(1);
    expect(unread.starts()).toBe(starts + 1);
  });

  it('follow props: a changed prop restarts the lane, without a PropsChanged reducer', async () => {
    const el = new PropBadge();
    document.body.append(el);
    await settled();
    expect(unread.live('inbox')).toBe(1);
    el.channel = 'news';
    await settled();
    expect(unread.live('inbox')).toBe(0);
    expect(unread.live('news')).toBe(1);
  });

  it('keep running across an appendChild move', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const el = new Badge();
    a.append(el);
    await settled();
    const starts = unread.starts();
    b.append(el); // disconnect + connect in one task
    await tick();
    expect(unread.live('inbox')).toBe(1);
    expect(unread.starts()).toBe(starts);
  });

  it('keep running across a reorder that removes and re-inserts rows in one task', async () => {
    const list = document.createElement('ul');
    document.body.append(list);
    const rows = [new Badge(), new Badge(), new Badge()];
    for (const row of rows) list.append(row);
    await settled();
    expect(unread.live('inbox')).toBe(3);
    for (const row of rows) row.remove();
    for (const row of rows.toReversed()) list.append(row);
    await tick();
    expect(unread.live('inbox')).toBe(3);
    unread.set('inbox', 7);
    await settled();
    expect(rows.map((row) => row.state.n)).toEqual([7, 7, 7]);
  });

  it('stop one microtask after a real removal', async () => {
    const el = new Badge();
    document.body.append(el);
    await settled();
    el.remove();
    expect(unread.live('inbox')).toBe(1);
    await Promise.resolve();
    expect(unread.live('inbox')).toBe(0);
  });

  it('start again from the current state when a stopped host is attached again', async () => {
    const el = new Badge();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Channel', name: 'alerts' });
    el.remove();
    await tick();
    expect(unread.live()).toBe(0);
    unread.set('alerts', 9);
    document.body.append(el);
    await settled();
    expect(unread.live('alerts')).toBe(1);
    expect(text(el)).toBe('9');
  });

  it('a watch started from init is not restarted after a real reattach', async () => {
    const el = new Plain();
    document.body.append(el);
    await settled();
    el.remove();
    await tick();
    document.body.append(el);
    await settled();
    expect(unread.live('inbox')).toBe(0);
  });

  it('a host moved before its first render starts its subscriptions once', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const el = new Badge();
    a.append(el);
    b.append(el);
    await settled();
    expect(unread.live('inbox')).toBe(1);
  });

  it('nested: a parent move keeps the child running; a parent reattach restarts it', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const panel = new Panel();
    a.append(panel);
    await settled();
    b.append(panel);
    await tick();
    expect(unread.live('inbox')).toBe(1);
    panel.remove();
    await tick();
    expect(unread.live('inbox')).toBe(0);
    document.body.append(panel);
    await settled();
    expect(unread.live('inbox')).toBe(1);
  });

  it('two subscriptions in one lane: the first runs and development warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const Twice = define<State, Msg>()('test-subs-twice', {
      init: () => ({ n: -1, live: true, channel: 'inbox', noise: 0 }),
      subscriptions: () => [watch('inbox'), watch('alerts')],
      update,
      view: (s) => html`${s.n}`,
    });
    document.body.append(new Twice());
    await settled();
    expect(unread.live('inbox')).toBe(1);
    expect(unread.live('alerts')).toBe(0);
    expect(warn.mock.calls.some(([text]) => String(text).includes('lane "unread"'))).toBe(true);
  });

  it('separate keys run side by side', async () => {
    const Both = define<State, Msg>()('test-subs-both', {
      init: () => ({ n: -1, live: true, channel: 'inbox', noise: 0 }),
      subscriptions: () => [watch('inbox', 'a'), watch('alerts', 'b')],
      update,
      view: (s) => html`${s.n}`,
    });
    document.body.append(new Both());
    await settled();
    expect(unread.live('inbox')).toBe(1);
    expect(unread.live('alerts')).toBe(1);
  });

  it('a throwing subscriptions is reported and leaves the running set as it was', async () => {
    const errors = collectErrors();
    const Broken = define<State, Msg>()('test-subs-broken', {
      init: () => ({ n: -1, live: true, channel: 'inbox', noise: 0 }),
      subscriptions: (s) => {
        if (s.noise > 0) throw new Error('boom');
        return [watch('inbox')];
      },
      update,
      view: (s) => html`${s.n}`,
    });
    const el = new Broken();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Noise' });
    expect(unread.live('inbox')).toBe(1);
    errors.stop();
    expect(errors.errors.some((e) => e.phase === 'update')).toBe(true);
  });
});
