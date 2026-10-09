import { afterEach, describe, expect, it } from 'vitest';
import { command, define, defineDriver, html, prop, retry, settled } from '@gyral/core';
import {
  commandsFor,
  fakeDriver,
  initial,
  inputsFor,
  reject,
  resolve,
  run,
  step,
  virtualTime,
  type VirtualTime,
} from '../src/index.js';

interface State {
  readonly id: string;
  readonly user: string | undefined;
  readonly error: string | undefined;
}
type Msg =
  | { readonly _tag: 'Load'; readonly id: string }
  | { readonly _tag: 'Loaded'; readonly name: string }
  | { readonly _tag: 'Failed'; readonly error: string };

const users = defineDriver<{ readonly id: string }, { readonly name: string }, string>({
  name: 'users',
  concurrency: 'switch',
  run: () => Promise.reject(new Error('real driver must not run in tests')),
  toError: (cause) => String(cause),
});

const loadUser = (id: string) =>
  command(
    users,
    { id },
    {
      onSuccess: (u): Msg => ({ _tag: 'Loaded', name: u.name }),
      onFailure: (error): Msg => ({ _tag: 'Failed', error }),
    },
  );

const Profile = define<State, Msg, { readonly userId: string }>()('test-profile', {
  props: { userId: prop.string({ required: true }) },
  init: (props) => [
    { id: props.userId, user: undefined, error: undefined },
    [loadUser(props.userId)],
  ],
  intent: {}, // Load comes from tests (send, step), not from the DOM
  update: {
    Load: (s, m) => [{ ...s, id: m.id }, [loadUser(m.id)]],
    Loaded: (s, m) => ({ ...s, user: m.name, error: undefined }),
    Failed: (s, m) => ({ ...s, error: m.error }),
    PropsChanged: (s, m) => [{ ...s, id: m.props.userId }, [loadUser(m.props.userId)]],
  },
  view: (s) => html`<p>${s.user ?? s.error ?? 'loading'}</p>`,
});

describe('pure stepping', () => {
  it('initial() runs init with props and returns its commands', () => {
    const { state, commands } = initial(Profile.spec, { userId: 'u1' });
    expect(state.id).toBe('u1');
    expect(inputsFor(commands, users)).toEqual([{ id: 'u1' }]);
  });

  it('step() normalises plain and [state, commands] results', () => {
    const s0: State = { id: 'u1', user: undefined, error: undefined };
    expect(step(Profile.spec, s0, { _tag: 'Loaded', name: 'Ada' }).commands).toEqual([]);
    const { state, commands } = step(Profile.spec, s0, { _tag: 'Load', id: 'u2' });
    expect(state.id).toBe('u2');
    expect(commandsFor(commands, users).map((c) => c.input.id)).toEqual(['u2']);
  });

  it('step() handles framework messages, with or without a reducer', () => {
    const s0: State = { id: 'u1', user: undefined, error: undefined };
    const changed = step(Profile.spec, s0, {
      _tag: 'PropsChanged',
      props: { userId: 'u9' },
      prev: { userId: 'u1' },
    });
    expect(inputsFor(changed.commands, users)).toEqual([{ id: 'u9' }]);
    const rejected = step(Profile.spec, s0, { _tag: 'IntentRejected', intent: 'Load', issues: [] });
    expect(rejected).toEqual({ state: s0, commands: [] });
  });

  it('step() and run() accept Hydrated, with or without a reducer (gyral-evw)', () => {
    const s0: State = { id: 'u1', user: undefined, error: undefined };
    // Profile has no Hydrated reducer: state is unchanged, as in the element.
    expect(step(Profile.spec, s0, { _tag: 'Hydrated', serverRendered: true })).toEqual({
      state: s0,
      commands: [],
    });
    const Live = define<{ readonly live: boolean }, never>()('test-hydrated-step', {
      init: () => ({ live: false }),
      intent: {},
      update: { Hydrated: (s, m) => ({ ...s, live: m.serverRendered }) },
      view: () => html`<p>live</p>`,
    });
    expect(
      step(Live.spec, { live: false }, { _tag: 'Hydrated', serverRendered: true }).state,
    ).toEqual({ live: true });
    expect(run(Live.spec, [{ _tag: 'Hydrated', serverRendered: true }]).state.live).toBe(true);
  });

  it('run() folds messages and collects every command, including init', () => {
    const result = run(
      Profile.spec,
      [
        { _tag: 'Load', id: 'u2' },
        { _tag: 'Loaded', name: 'Bo' },
      ],
      {
        props: { userId: 'u1' },
      },
    );
    expect(result.state.user).toBe('Bo');
    expect(inputsFor(result.commands, users)).toEqual([{ id: 'u1' }, { id: 'u2' }]);
    expect(result.states.map((s) => s.id)).toEqual(['u2', 'u2']);
  });

  it('resolve() / reject() drive the loop through command mappers', () => {
    const [cmd] = initial(Profile.spec, { userId: 'u1' }).commands;
    if (cmd === undefined) throw new Error('no command');
    expect(resolve(cmd, { name: 'Ada' })).toEqual({ _tag: 'Loaded', name: 'Ada' });
    expect(reject(cmd, 'boom')).toEqual({ _tag: 'Failed', error: 'boom' });
  });
});

describe('fakeDriver', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  async function mount(
    fake: ReturnType<typeof fakeDriver<{ readonly id: string }, { readonly name: string }, string>>,
  ) {
    const el = new Profile();
    Object.assign(el, { userId: 'u1' });
    el.drivers = { users: fake };
    document.body.append(el);
    await settled();
    return el;
  }

  const text = (el: Element) => el.shadowRoot?.querySelector('p')?.textContent;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('records calls and settles them on demand', async () => {
    const fake = fakeDriver(users);
    const el = await mount(fake);
    await flush();
    expect(fake.inputs).toEqual([{ id: 'u1' }]);
    expect(fake.concurrency).toBe('switch');
    fake.resolveNext({ name: 'Ada' });
    await flush();
    await settled();
    expect(text(el)).toBe('Ada');
  });

  it('passes typed errors straight to onFailure', async () => {
    const fake = fakeDriver(users);
    const el = await mount(fake);
    await flush();
    fake.rejectNext('not found');
    await flush();
    expect(el.state.error).toBe('not found');
  });

  it('exposes the abort signal and skips aborted calls', async () => {
    const fake = fakeDriver(users);
    const el = await mount(fake);
    await flush();
    el.send({ _tag: 'Load', id: 'u2' });
    await flush();
    expect(fake.calls[0]?.signal.aborted).toBe(true);
    fake.resolveNext({ name: 'Second' });
    await flush();
    expect(el.state.user).toBe('Second');
  });

  it('streams values into a running call with emitNext and call.emit', async () => {
    const fake = fakeDriver(users);
    const el = await mount(fake);
    await flush();
    fake.emitNext({ name: 'Ada' });
    expect(el.state.user).toBe('Ada');
    fake.emitNext({ name: 'Grace' });
    expect(el.state.user).toBe('Grace');
    expect(fake.calls[0]?.settled).toBe(false); // still running: a stream

    const first = fake.calls[0];
    el.send({ _tag: 'Load', id: 'u2' }); // switch: the first stream is aborted
    await flush();
    first?.emit({ name: 'stale' });
    expect(el.state.user).toBe('Grace');
    fake.emitNext({ name: 'Second' }); // goes to the newest running call
    expect(el.state.user).toBe('Second');
  });

  it('emitNext throws when no call is running', async () => {
    const fake = fakeDriver(users);
    const el = await mount(fake);
    await flush();
    fake.resolveNext({ name: 'done' });
    await flush();
    expect(el.state.user).toBe('done');
    expect(() => {
      fake.emitNext({ name: 'x' });
    }).toThrow(/no running call/);
  });

  it('answers immediately with impl', async () => {
    const fake = fakeDriver(users, { impl: ({ id }) => ({ name: `user ${id}` }) });
    const el = await mount(fake);
    await flush();
    expect(el.state.user).toBe('user u1');
    expect(() => {
      fake.resolveNext({ name: 'x' });
    }).toThrow(/no pending call/);
  });
});

describe('virtualTime', () => {
  let time: VirtualTime | undefined;
  afterEach(() => {
    time?.restore();
    time = undefined;
    document.body.replaceChildren();
  });

  const delay = defineDriver<{ readonly ms: number }, undefined>({
    name: 'delay',
    run: ({ ms }, { signal }) =>
      new Promise((done) => {
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
        });
      }),
  });

  const Timer = define<{ readonly fired: number }, { readonly _tag: 'Fire' }>()('test-timer', {
    init: () => [
      { fired: 0 },
      [command(delay, { ms: 60_000 }, { onSuccess: () => ({ _tag: 'Fire' }) })],
    ],
    intent: {},
    update: { Fire: (s) => ({ fired: s.fired + 1 }) },
    view: (s) => html`${s.fired}`,
  });

  it('advances driver timers without waiting', async () => {
    time = virtualTime();
    const el = new Timer();
    document.body.append(el);
    await settled();
    await time.advance(59_999);
    expect(el.state.fired).toBe(0);
    await time.advance(1);
    expect(el.state.fired).toBe(1);
    expect(time.now()).toBe(Date.now());
  });

  it('drives the delays of a retry() wrapper', async () => {
    time = virtualTime();
    let attempts = 0;
    const flaky = retry(
      fakeDriver(users, {
        impl: () => {
          attempts += 1;
          return attempts < 3 ? Promise.reject(new Error('flaky')) : { name: 'Ok' };
        },
      }),
      { times: 2, delayMs: 1_000, backoff: 'fixed' },
    );
    const el = new Profile();
    Object.assign(el, { userId: 'u1' });
    el.drivers = { users: flaky };
    document.body.append(el);
    await settled();
    await time.advance(999);
    expect(attempts).toBe(1);
    await time.runAll();
    expect(attempts).toBe(3);
    expect(el.state.user).toBe('Ok');
  });
});
