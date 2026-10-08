// settled() bounds (view/04-scheduler.md "settled()", gyral-dyn.30): a finite burst of messages
// (a progress stream, an async iterable over a list) settles; a stream that never stops still
// rejects with the cycle error instead of waiting forever.
import { afterEach, describe, expect, it } from 'vitest';
import { command, define, html, settled, subscription } from '../src/index.js';

/** Emits `count` values, one per microtask (Infinity: forever, until unsubscribed). */
const burst = (name: string, count: number) =>
  subscription<number>(name, (emit) => {
    const stop = new AbortController();
    void (async () => {
      for (let n = 1; n <= count && !stop.signal.aborted; n += 1) {
        await Promise.resolve();
        emit(n);
      }
    })();
    return () => {
      stop.abort();
    };
  });

type Msg = { readonly _tag: 'Progress'; readonly n: number };

const meter = (tag: string, count: number) =>
  define<{ readonly n: number }, Msg>(tag, {
    init: () => [
      { n: 0 },
      [command(burst(tag, count), undefined, { onSuccess: (n): Msg => ({ _tag: 'Progress', n }) })],
    ],
    intent: {},
    update: { Progress: (_s, m) => ({ n: m.n }) },
    view: (s) => html`<progress max="500" value=${s.n}></progress>`,
  });

const Finite = meter('test-settled-burst', 500);
const Endless = meter('test-settled-endless', Infinity);

afterEach(() => {
  document.body.replaceChildren();
});

describe('settled() and message bursts', () => {
  it('waits through a finite burst of 500 messages', async () => {
    const el = new Finite();
    document.body.append(el);
    await settled();
    expect(el.state.n).toBe(500);
  });

  it('still rejects for a stream that never stops', async () => {
    const el = new Endless();
    document.body.append(el);
    await expect(settled()).rejects.toThrow(/did not settle/);
    el.remove();
  });
});
