// settled() waits until messages stop arriving (docs/design-docs/view/04-scheduler.md
// "`settled()`"), not for commands to finish: streams that live as long as the component never
// block it, and timers are never waited for. The chain below is the sabacc.starwars.run table
// (Lit → Gyral 0.3 migration; their `watch()` in src/components/table-driver.ts, quoted with
// permission): game state lives in a signals store Gyral doesn't own, a streaming driver
// watches it and re-arms in a microtask, and a `play` command dispatches to it synchronously.
import { afterEach, describe, expect, it } from 'vitest';
import {
  command,
  define,
  defineDriver,
  defineDisposableHook,
  html,
  nothing,
  provideDrivers,
  settled,
  subscription,
  type Command,
} from '../src/index.js';
import { signalLike, type SignalLike } from './signal-like.js';

type TableInput = { readonly _tag: 'Play' } | { readonly _tag: 'Watch' };

/** The table driver bound to one store: `Play` moves synchronously, `Watch` streams moves. */
const tableDriver = (moves: SignalLike<number>) =>
  defineDriver<TableInput, number | undefined>({
    name: 'table',
    run: (input, { signal, emit }) => {
      if (input._tag === 'Play') {
        moves.set(moves.get() + 1); // the store's dispatch: synchronous
        return undefined;
      }
      // sabacc's watch(): emit now and after every change, until aborted.
      return new Promise<never>(() => {
        const watcher = moves.watcher(() => {
          // Signals can't be read inside the notification: read and re-arm in a microtask.
          queueMicrotask(() => {
            if (signal.aborted) return;
            watcher.watch();
            emit(moves.get());
          });
        });
        emit(moves.get());
        signal.addEventListener('abort', watcher.unwatch, { once: true });
      });
    },
  });

/** The default before a page provides its store, as in sabacc. */
const unbound = defineDriver<TableInput, number | undefined>({
  name: 'table',
  run: () => {
    throw new Error('no table provided');
  },
});

/** A second stream that never ends (sabacc's reduced-motion `matchMedia` watch). */
const motion = defineDriver<undefined, boolean>({
  name: 'motion',
  run: (_input, { emit }) =>
    new Promise<never>(() => {
      emit(false);
    }),
});

/** A timer the test never runs: settled() must not wait for it. */
const later = defineDriver<number, number>({
  name: 'later',
  run: (ms) =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(ms);
      }, ms);
    }),
});

type Msg =
  | { readonly _tag: 'TableChanged'; readonly moves: number }
  | { readonly _tag: 'Motion'; readonly reduce: boolean }
  | { readonly _tag: 'Deal' }
  | { readonly _tag: 'Wait' }
  | { readonly _tag: 'Waited' };
interface State {
  readonly moves: number;
  readonly waited: boolean;
}

const play = (): Command<Msg> =>
  command(unbound, { _tag: 'Play' }, { onSuccess: (): Msg | undefined => undefined });

/** After a deal (move 1, 11, …) the table plays itself up to move 6, 16, … (bots' turns). */
const autoPlays = (moves: number): boolean => moves % 10 > 0 && moves % 10 < 6;

const tableOf = (tag: string) =>
  define<State, Msg>(tag, {
    init: () => [
      { moves: -1, waited: false },
      [
        command(
          unbound,
          { _tag: 'Watch' },
          {
            onSuccess: (n): Msg | undefined =>
              n === undefined ? undefined : { _tag: 'TableChanged', moves: n },
            key: 'watch',
            concurrency: 'switch',
          },
        ),
        command(motion, undefined, { onSuccess: (reduce): Msg => ({ _tag: 'Motion', reduce }) }),
      ],
    ],
    intent: { Deal: () => ({ _tag: 'Deal' }), Wait: () => ({ _tag: 'Wait' }) },
    update: {
      TableChanged: (s, m) =>
        autoPlays(m.moves) ? [{ ...s, moves: m.moves }, [play()]] : { ...s, moves: m.moves },
      Motion: (s) => s,
      Deal: (s) => [s, [play()]],
      Wait: (s) => [s, [command(later, 50, { onSuccess: (): Msg => ({ _tag: 'Waited' }) })]],
      Waited: (s) => ({ ...s, waited: true }),
    },
    view: (s, i) => html`
      <output>${s.moves}</output>
      <button type="button" data-intent=${i.Deal}>Deal</button>
      <button type="button" data-intent=${i.Wait}>Wait</button>
    `,
  });

let tags = 0;

async function mountTable(moves: SignalLike<number>) {
  const Table = tableOf(`test-quiet-table-${String((tags += 1))}`);
  const host = document.createElement('div');
  provideDrivers(host, { table: tableDriver(moves) });
  const el = new Table();
  host.append(el);
  document.body.append(host);
  await settled();
  const shown = () => el.shadowRoot?.querySelector('output')?.textContent;
  const click = (n: number) => {
    el.shadowRoot?.querySelectorAll('button')[n]?.click();
  };
  return { el, shown, click };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('settled() waits for messages, not for commands', () => {
  it('follows a click through the store and back (two streams stay open)', async () => {
    const moves = signalLike(6);
    const { shown, click } = await mountTable(moves);
    expect(shown()).toBe('6');
    click(0); // intent → reducer → play → store → watcher → microtask → TableChanged
    await settled();
    expect(shown()).toBe('7');
  });

  // The batched case fails with 0.3.0's settled() (four quiet microtask turns, blind to
  // messages that arrived and rendered inside them): it returned at move 12 of 16.
  for (const batched of [false, true]) {
    const how = batched ? 'batched' : 'sync';
    it(`waits for moves that answer moves (notifications ${how})`, async () => {
      const moves = signalLike(0, { batched });
      const { shown, click } = await mountTable(moves);
      click(0); // deals move 1; the table plays itself up to move 6
      await settled();
      expect(shown()).toBe('6');
      moves.set(11); // a deal made elsewhere (another view, the server): up to 16
      await settled();
      expect(shown()).toBe('16');
    });
  }

  it('stops the watch when the component goes away', async () => {
    const moves = signalLike(0, { batched: true });
    const { el } = await mountTable(moves);
    expect(moves.watchers()).toBe(1);
    el.remove();
    await new Promise((r) => setTimeout(r, 0)); // disconnect interrupts on a later tick
    expect(moves.watchers()).toBe(0);
    await expect(settled()).resolves.toBeUndefined();
  });

  it('neither waits for nor advances timers', async () => {
    const { el, click } = await mountTable(signalLike(0));
    click(1);
    await settled();
    expect(el.state.waited).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    await settled();
    expect(el.state.waited).toBe(true);
  });
});

// A driver that answers every message with the next one, in a microtask, forever.
const echo = defineDriver<number, number>({ name: 'echo', run: (n) => n + 1 });
type EchoMsg = { readonly _tag: 'Echo'; readonly n: number };
const Echo = define<{ readonly n: number }, EchoMsg>('test-quiet-echo', {
  init: () => ({ n: 0 }),
  intent: {},
  update: {
    Echo: (_s, m) => [
      { n: m.n },
      [command(echo, m.n, { onSuccess: (n): EchoMsg => ({ _tag: 'Echo', n }) })],
    ],
  },
  view: (s) => html`<p>${s.n}</p>`,
});

describe('settled() is bounded', () => {
  it('rejects when messages never stop arriving', async () => {
    const el = new Echo();
    document.body.append(el);
    await settled();
    el.send({ _tag: 'Echo', n: 1 });
    await expect(settled()).rejects.toThrow(/did not settle/);
    el.remove(); // ends the chain: a disconnected host's commands stop
    await new Promise((r) => setTimeout(r, 0));
    await expect(settled()).resolves.toBeUndefined();
  });
});

// A widget's hook dispose (view/02 "Widgets with a lifecycle") that writes to an outside store,
// read back through subscription(): close → render → dispose → batched notification → re-arm
// in a microtask → message → render. settled() after the click sees the end of that chain.
const mounted = signalLike(0, { batched: true });
const widget = defineDisposableHook<[]>({
  client: (_el, _args, prev) => {
    if (prev === undefined) mounted.set(mounted.get() + 1);
  },
  dispose: () => {
    mounted.set(mounted.get() - 1);
  },
});
const watchMounted = subscription<number>('mounted', (emit) => {
  const watcher = mounted.watcher(() => {
    queueMicrotask(() => {
      watcher.watch();
      emit(mounted.get());
    });
  });
  emit(mounted.get());
  return watcher.unwatch;
});
type PanelMsg = { readonly _tag: 'Close' } | { readonly _tag: 'Mounted'; readonly n: number };
const Panel = define<{ readonly open: boolean; readonly mounted: number }, PanelMsg>(
  'test-quiet-dispose',
  {
    init: () => [
      { open: true, mounted: -1 },
      [command(watchMounted, undefined, { onSuccess: (n): PanelMsg => ({ _tag: 'Mounted', n }) })],
    ],
    intent: { Close: () => ({ _tag: 'Close' }) },
    update: {
      Close: (s) => ({ ...s, open: false }),
      Mounted: (s, m) => ({ ...s, mounted: m.n }),
    },
    view: (s, i) => html`
      ${s.open ? html`<canvas ${widget()}></canvas>` : nothing}
      <output>${s.mounted}</output>
      <button type="button" data-intent=${i.Close}>Close</button>
    `,
  },
);

describe('settled() with hook dispose', () => {
  it('waits for messages a dispose sets off through an outside store', async () => {
    const el = new Panel();
    document.body.append(el);
    await settled();
    const shown = () => el.shadowRoot?.querySelector('output')?.textContent;
    expect(shown()).toBe('1');
    el.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(el.shadowRoot?.querySelector('canvas')).toBeNull();
    expect(shown()).toBe('0');
  });
});
