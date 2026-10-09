import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { inputsFor, step, virtualTime, type VirtualTime } from '@gyral/testing';
import { animationFrames, debounce, delay, makeTime, periodic, time } from '../src/index.js';

type Msg =
  | { readonly _tag: 'Tick'; readonly n: number }
  | { readonly _tag: 'Fired'; readonly label: string }
  | { readonly _tag: 'Frame'; readonly delta: number }
  | { readonly _tag: 'StartFrames' }
  | { readonly _tag: 'Restart' }
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Later'; readonly label: string; readonly ms: number; readonly key?: string };

interface State {
  readonly ticks: readonly number[];
  readonly fired: readonly string[];
  readonly deltas: readonly number[];
}

const Clock = define<State, Msg>()('test-clock', {
  init: () => [
    { ticks: [], fired: [], deltas: [] },
    [periodic(1000, (n) => ({ _tag: 'Tick', n }))],
  ],
  intent: {},
  update: {
    Tick: (s, m) => ({ ...s, ticks: [...s.ticks, m.n] }),
    Fired: (s, m) => ({ ...s, fired: [...s.fired, m.label] }),
    Frame: (s, m) => ({ ...s, deltas: [...s.deltas, m.delta] }),
    StartFrames: (s) => [s, [animationFrames((f) => ({ _tag: 'Frame', delta: f.delta }))]],
    Restart: (s) => [{ ...s, ticks: [] }, [periodic(500, (n) => ({ _tag: 'Tick', n }))]],
    Typed: (s, m) => [s, [debounce(300, { _tag: 'Fired', label: m.text })]],
    Later: (s, m) => [
      s,
      [delay(m.ms, { _tag: 'Fired', label: m.label }, m.key === undefined ? {} : { key: m.key })],
    ],
  },
  view: (s) => html`<p>${s.ticks.length}</p>`,
});

let clock: VirtualTime | undefined;

async function mount() {
  clock = virtualTime();
  const el = new Clock();
  document.body.append(el);
  await settled();
  return { el, advance: (ms: number) => (clock as VirtualTime).advance(ms) };
}

afterEach(() => {
  document.body.replaceChildren();
  clock?.restore();
  clock = undefined;
});

describe('@gyral/time', () => {
  it('periodic streams elapsed-period counts', async () => {
    const { el, advance } = await mount();
    await advance(3000);
    expect(el.state.ticks).toEqual([1, 2, 3]);
  });

  it('a new periodic in the same lane replaces the old one', async () => {
    const { el, advance } = await mount();
    await advance(1000);
    el.send({ _tag: 'Restart' });
    await advance(1000);
    expect(el.state.ticks).toEqual([1, 2]);
  });

  it('delays in the default lane all fire, in order', async () => {
    const { el, advance } = await mount();
    el.send({ _tag: 'Later', label: 'slow', ms: 200 });
    el.send({ _tag: 'Later', label: 'fast', ms: 100 });
    await advance(200);
    expect(el.state.fired).toEqual(['fast', 'slow']);
  });

  it('debounce fires once after a pause', async () => {
    const { el, advance } = await mount();
    el.send({ _tag: 'Typed', text: 'a' });
    await advance(299);
    el.send({ _tag: 'Typed', text: 'ab' });
    await advance(299);
    expect(el.state.fired).toEqual([]);
    await advance(1);
    expect(el.state.fired).toEqual(['ab']);
  });

  it('animationFrames streams frames with deltas', async () => {
    const { el, advance } = await mount();
    el.send({ _tag: 'StartFrames' });
    await advance(50);
    expect(el.state.deltas.length).toBeGreaterThanOrEqual(2);
    expect(el.state.deltas[0]).toBe(0);
    expect(el.state.deltas[1]).toBeGreaterThan(0);
  });

  it('stops every timer when the component disconnects', async () => {
    const { el, advance } = await mount();
    el.send({ _tag: 'StartFrames' });
    el.send({ _tag: 'Later', label: 'never', ms: 100 });
    await advance(1000);
    el.remove();
    const before = { ...el.state };
    await advance(5000);
    expect(el.state).toEqual(before);
  });

  it('commands are data: testable without timers', () => {
    const s: State = { ticks: [], fired: [], deltas: [] };
    const { commands } = step(Clock.spec, s, { _tag: 'Typed', text: 'x' });
    expect(inputsFor(commands, time)).toEqual([{ _tag: 'Delay', ms: 300 }]);
    expect(commands[0]?.key).toBe('time:debounce');
    expect(commands[0]?.concurrency).toBe('switch');
  });

  it('makeTime() names the driver for substitution and starts nothing on creation', () => {
    expect(makeTime({ name: 'clock' }).name).toBe('clock');
    expect(time.name).toBe('time');
  });
});
