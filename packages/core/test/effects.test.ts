import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  command,
  define,
  defineDriver,
  html,
  type Concurrency,
  type Driver,
  type RetryPolicy,
} from '../src/index.js';

interface State {
  readonly log: readonly string[];
}

type Msg =
  | { readonly _tag: 'Go'; readonly q: string }
  | { readonly _tag: 'Done'; readonly v: string }
  | { readonly _tag: 'Failed'; readonly e: string };

/** Placeholder; every test injects its own driver under this name. */
const work = defineDriver<string, string, string>({
  name: 'work',
  run: (q) => q,
  toError: String,
});

const Fx = define<State, Msg>('test-fx', {
  init: () => [{ log: [] }, [command(work, 'init', { onSuccess: (v) => ({ _tag: 'Done', v }) })]],
  intent: {},
  update: {
    Go: (s, m) => [
      s,
      [
        command(work, m.q, {
          onSuccess: (v) => ({ _tag: 'Done', v }),
          onFailure: (e) => ({ _tag: 'Failed', e }),
        }),
      ],
    ],
    Done: (s, m) => ({ log: [...s.log, `done:${m.v}`] }),
    Failed: (s, m) => ({ log: [...s.log, `failed:${m.e}`] }),
  },
  view: (s) => html`<p>${s.log.join(',')}</p>`,
});

/** A driver whose calls stay pending until the test settles them. */
function deferred(concurrency: Concurrency) {
  const calls: { q: string; signal: AbortSignal; resolve: (v: string) => void }[] = [];
  const driver: Driver<string, string, string> = {
    name: 'work',
    concurrency,
    toError: String,
    run: (q, { signal }) =>
      q === 'init'
        ? q
        : new Promise<string>((resolve) => {
            calls.push({ q, signal, resolve });
          }),
  };
  return { driver, calls };
}

async function mount(driver: Driver<string, string, string>) {
  const el = new Fx();
  el.drivers = { work: driver };
  document.body.append(el);
  await el.updateComplete;
  await vi.waitFor(() => {
    expect(el.state.log).toEqual(['done:init']);
  });
  return el;
}

const go = (q: string): Msg => ({ _tag: 'Go', q });

afterEach(() => {
  document.body.replaceChildren();
});

describe('commands and drivers', () => {
  it('runs commands returned by init once connected', async () => {
    await mount(work);
  });

  it('merge: runs commands concurrently and reports each result', async () => {
    const { driver, calls } = deferred('merge');
    const el = await mount(driver);
    el.send(go('a'));
    el.send(go('b'));
    await vi.waitFor(() => {
      expect(calls.map((c) => c.q)).toEqual(['a', 'b']);
    });
    calls[1]?.resolve('b');
    calls[0]?.resolve('a');
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'done:b', 'done:a']);
    });
  });

  it('switch: interrupts the in-flight command and drops its late result', async () => {
    const { driver, calls } = deferred('switch');
    const el = await mount(driver);
    el.send(go('a'));
    el.send(go('b'));
    await vi.waitFor(() => {
      expect(calls.map((c) => c.q)).toEqual(['a', 'b']);
    });
    expect(calls[0]?.signal.aborted).toBe(true);
    calls[0]?.resolve('a');
    calls[1]?.resolve('b');
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'done:b']);
    });
  });

  it('exhaust: ignores new commands while one is in flight', async () => {
    const { driver, calls } = deferred('exhaust');
    const el = await mount(driver);
    el.send(go('a'));
    el.send(go('b'));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    calls[0]?.resolve('a');
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'done:a']);
    });
    el.send(go('c'));
    await vi.waitFor(() => {
      expect(calls.map((c) => c.q)).toEqual(['a', 'c']);
    });
  });

  it('queue: runs one at a time in order', async () => {
    const { driver, calls } = deferred('queue');
    const el = await mount(driver);
    el.send(go('a'));
    el.send(go('b'));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    calls[0]?.resolve('a');
    await vi.waitFor(() => {
      expect(calls.map((c) => c.q)).toEqual(['a', 'b']);
    });
    calls[1]?.resolve('b');
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'done:a', 'done:b']);
    });
  });

  it('turns failures into messages via toError', async () => {
    const el = await mount({
      name: 'work',
      run: (q) => (q === 'init' ? q : Promise.reject(new Error(`bad ${q}`))),
      toError: (cause) => (cause instanceof Error ? cause.message : 'unknown'),
    });
    el.send(go('x'));
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'failed:bad x']);
    });
  });

  it('catches synchronous throws from run', async () => {
    const el = await mount({
      name: 'work',
      run: (q) => {
        if (q === 'init') return q;
        throw new Error('sync');
      },
      toError: (cause) => (cause instanceof Error ? cause.message : 'unknown'),
    });
    el.send(go('x'));
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'failed:sync']);
    });
  });

  it.each<[RetryPolicy, string]>([
    [{ times: 2, delayMs: 1 }, 'done:x'],
    [{ times: 1, delayMs: 1, backoff: 'exponential' }, 'failed:attempt 2'],
  ])('retries per policy %o', async (retry, expected) => {
    let attempts = 0;
    const el = await mount({
      name: 'work',
      retry,
      toError: (cause) => (cause instanceof Error ? cause.message : 'unknown'),
      run: (q) => {
        if (q === 'init') return q;
        attempts += 1;
        return attempts < 3 ? Promise.reject(new Error(`attempt ${String(attempts)}`)) : q;
      },
    });
    el.send(go('x'));
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', expected]);
    });
  });

  it('interrupts in-flight work on disconnect and never dispatches it', async () => {
    const { driver, calls } = deferred('merge');
    const el = await mount(driver);
    el.send(go('a'));
    await vi.waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    el.remove();
    await vi.waitFor(() => {
      expect(calls[0]?.signal.aborted).toBe(true);
    });
    calls[0]?.resolve('a');
    await new Promise((r) => setTimeout(r, 10));
    expect(el.state.log).toEqual(['done:init']);
  });

  it('runs commands again after reconnecting', async () => {
    const el = await mount(work);
    el.remove();
    document.body.append(el);
    el.send(go('z'));
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'done:z']);
    });
  });

  it('prefers instance drivers over the spec and the command default', async () => {
    const el = await mount({ name: 'work', run: (q) => (q === 'init' ? q : `fake-${q}`) });
    el.send(go('y'));
    await vi.waitFor(() => {
      expect(el.state.log).toEqual(['done:init', 'done:fake-y']);
    });
  });
});
