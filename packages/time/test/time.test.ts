import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { inputsFor, step, virtualTime, type VirtualTime } from '@gyral/testing';
import { makeTime } from '../src/driver.js';
import { command, type Command } from '@gyral/core';
import { debounce, delay, every, time, type Frame } from '../src/index.js';

// The animation-frames recipe (skill: effects-and-drivers "Animation frames"): the time driver
// streams frames for `{ _tag: 'Frames' }`, in a switch lane.
const animationFrames = <M>(toMsg: (frame: Frame) => M): Command<M> =>
  command(
    time,
    { _tag: 'Frames' },
    {
      onSuccess: (output) => (typeof output === 'object' ? toMsg(output) : undefined),
      key: 'time:frames',
      concurrency: 'switch',
    },
  );

type Msg =
  | { readonly _tag: 'Tick'; readonly now: number }
  | { readonly _tag: 'Fired'; readonly label: string }
  | { readonly _tag: 'Frame'; readonly delta: number }
  | { readonly _tag: 'StartFrames' }
  | { readonly _tag: 'Restart' }
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Later'; readonly label: string; readonly ms: number; readonly key?: string };

interface State {
  /** The period of the clock subscription (ms). */
  readonly period: number;
  readonly ticks: readonly number[];
  readonly fired: readonly string[];
  readonly deltas: readonly number[];
}

const Clock = define<State, Msg>()('test-clock', {
  init: () => ({ period: 1000, ticks: [], fired: [], deltas: [] }),
  subscriptions: (s) => [every(s.period, (now) => ({ _tag: 'Tick', now }))],
  update: {
    Tick: (s, m) => ({ ...s, ticks: [...s.ticks, m.now] }),
    Fired: (s, m) => ({ ...s, fired: [...s.fired, m.label] }),
    Frame: (s, m) => ({ ...s, deltas: [...s.deltas, m.delta] }),
    StartFrames: (s) => [s, [animationFrames((f) => ({ _tag: 'Frame', delta: f.delta }))]],
    Restart: (s) => ({ ...s, period: 500, ticks: [] }),
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
  it('every sends the wall-clock time at once, then every period', async () => {
    const { el, advance } = await mount();
    const start = (clock as VirtualTime).now();
    await advance(3000);
    expect(el.state.ticks).toEqual([start, start + 1000, start + 2000, start + 3000]);
  });

  it('a subscription whose input changes restarts with it', async () => {
    const { el, advance } = await mount();
    await advance(1000);
    el.send({ _tag: 'Restart' }); // period 1000 → 500: the lane restarts and ticks at once
    const restarted = (clock as VirtualTime).now();
    await advance(1000);
    expect(el.state.ticks).toEqual([restarted, restarted + 500, restarted + 1000]);
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
    const s: State = { period: 1000, ticks: [], fired: [], deltas: [] };
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
