import { afterEach, describe, expect, it } from 'vitest';
import { command, define, defineDriver, html } from '../src/index.js';

// A driver that streams ticks until aborted; tests push values through the recorded emit.
let streams: { emit: (n: number) => void; signal: AbortSignal }[] = [];
const push = (n: number): void => streams.at(-1)?.emit(n);
const ticks = defineDriver<string, number>({
  name: 'ticks',
  concurrency: 'switch',
  run: (_input, { signal, emit }) =>
    new Promise<never>((_resolve, reject) => {
      streams.push({ emit, signal });
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }),
});

// Emits twice synchronously, then resolves: a finite stream whose last value is the result.
const burst = defineDriver<undefined, number>({
  name: 'burst',
  run: (_input, { emit }) => {
    emit(1);
    emit(2);
    return Promise.resolve(3);
  },
});

type Msg =
  | { readonly _tag: 'Tick'; readonly n: number }
  | { readonly _tag: 'Restart' }
  | { readonly _tag: 'Burst' };

const Ticker = define<{ readonly seen: readonly number[] }, Msg>('test-ticker', {
  init: () => [{ seen: [] }, [command(ticks, 'a', { onSuccess: (n) => ({ _tag: 'Tick', n }) })]],
  intent: {},
  update: {
    Tick: (s, m) => ({ seen: [...s.seen, m.n] }),
    Restart: (s) => [s, [command(ticks, 'b', { onSuccess: (n) => ({ _tag: 'Tick', n }) })]],
    Burst: (s) => [s, [command(burst, undefined, { onSuccess: (n) => ({ _tag: 'Tick', n }) })]],
  },
  view: (s) => html`<p>${s.seen.join(',')}</p>`,
});

const settle = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const el = new Ticker();
  document.body.append(el);
  await el.updateComplete;
  await settle();
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
  streams = [];
});

describe('streaming drivers (DriverContext.emit)', () => {
  it('turns every emitted value into a message', async () => {
    const el = await mount();
    push(1);
    push(2);
    expect(el.state.seen).toEqual([1, 2]);
  });

  it('delivers emits and the final result of a finite stream in order', async () => {
    const el = await mount();
    el.send({ _tag: 'Burst' });
    await settle();
    expect(el.state.seen).toEqual([1, 2, 3]);
  });

  it('ignores emits from a stream that was switched away', async () => {
    const el = await mount();
    const [old] = streams;
    el.send({ _tag: 'Restart' });
    await settle();
    expect(old?.signal.aborted).toBe(true);
    old?.emit(99);
    push(7);
    expect(el.state.seen).toEqual([7]);
  });

  it('stops the stream on disconnect and ignores late emits', async () => {
    const el = await mount();
    const [stream] = streams;
    el.remove();
    await settle();
    expect(stream?.signal.aborted).toBe(true);
    stream?.emit(5);
    expect(el.state.seen).toEqual([]);
  });
});
