// `@gyral/time/delay` (gyral-c5d.15): delay and debounce for apps that need nothing else, with a
// delay-only driver named `time` like the full one, so lanes, substitution and virtual time
// behave the same.
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { inputsFor, step, virtualTime, type VirtualTime } from '@gyral/testing';
import { debounce, delay, delayTime } from '../src/delay.js';
import { time } from '../src/index.js';

type Msg =
  | { readonly _tag: 'Fired'; readonly label: string }
  | { readonly _tag: 'Typed'; readonly text: string }
  | { readonly _tag: 'Later'; readonly label: string; readonly ms: number };

interface State {
  readonly fired: readonly string[];
}

const Toast = define<State, Msg>()('test-delay-only', {
  init: () => ({ fired: [] }),
  intent: {},
  update: {
    Fired: (s, m) => ({ fired: [...s.fired, m.label] }),
    Typed: (s, m) => [s, [debounce(300, { _tag: 'Fired', label: m.text })]],
    Later: (s, m) => [s, [delay(m.ms, { _tag: 'Fired', label: m.label })]],
  },
  view: (s) => html`<p>${s.fired.length}</p>`,
});

let clock: VirtualTime | undefined;

afterEach(() => {
  document.body.replaceChildren();
  clock?.restore();
  clock = undefined;
});

async function mount() {
  clock = virtualTime();
  const el = new Toast();
  document.body.append(el);
  await settled();
  return { el, advance: (ms: number) => (clock as VirtualTime).advance(ms) };
}

describe('@gyral/time/delay', () => {
  it('delays fire in order and debounce fires once after a pause', async () => {
    const { el, advance } = await mount();
    el.send({ _tag: 'Later', label: 'slow', ms: 200 });
    el.send({ _tag: 'Later', label: 'fast', ms: 100 });
    el.send({ _tag: 'Typed', text: 'a' });
    await advance(250);
    el.send({ _tag: 'Typed', text: 'ab' });
    await advance(300);
    expect(el.state.fired).toEqual(['fast', 'slow', 'ab']);
  });

  it('builds the same commands as @gyral/time, on a driver also named time', () => {
    const { commands } = step(Toast.spec, { fired: [] }, { _tag: 'Typed', text: 'x' });
    expect(inputsFor(commands, delayTime)).toEqual([{ _tag: 'Delay', ms: 300 }]);
    expect(commands[0]?.key).toBe('time:debounce');
    expect(commands[0]?.concurrency).toBe('switch');
    expect(delayTime.name).toBe(time.name);
  });

  it('rejects inputs only the full driver runs', async () => {
    const signal = new AbortController().signal;
    const run = delayTime.run({ _tag: 'Periodic', ms: 10 }, { signal, emit: () => undefined });
    await expect(run).rejects.toThrow(/delays only/);
  });
});
