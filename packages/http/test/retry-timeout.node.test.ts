// retry() with jitter and retryIf, and the http driver's per-attempt timeoutMs, under fake
// timers in Node (ADR 0022, gyral-dyn.34).
import { retry, type DriverContext } from '@gyral/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHttpDriver, retryableHttpError, type HttpError } from '../src/index.js';

const clock = { advance: (ms: number) => vi.advanceTimersByTimeAsync(ms) };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ctx = (signal = new AbortController().signal): DriverContext => ({
  signal,
  emit: () => undefined,
});

/** A fetch that answers each call from `answers` in turn; a function hangs until aborted. */
function scripted(...answers: (number | 'hang' | 'offline')[]) {
  const calls: number[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
    calls.push(Date.now());
    const answer = answers.shift() ?? 200;
    if (answer === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason as Error);
        });
      });
    }
    return Promise.resolve(Response.json({ status: answer }, { status: answer }));
  });
  return { fetch, calls };
}

/** The driver's typed error (every http driver has `toError`). */
const errorsOf =
  (driver: { readonly toError?: (cause: unknown) => HttpError }) =>
  (cause: unknown): HttpError =>
    driver.toError?.(cause) ?? (cause as HttpError);

async function outcome(promise: Promise<unknown>, toError: (cause: unknown) => HttpError) {
  try {
    return { ok: await promise };
  } catch (cause) {
    return { error: toError(cause) };
  }
}

describe('makeHttpDriver({ timeoutMs })', () => {
  it('fails a slow attempt with HttpTimeoutError', async () => {
    const { fetch } = scripted('hang');
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://api.test/', timeoutMs: 500 });
    const run = outcome(Promise.resolve(driver.run({ url: 'slow' }, ctx())), errorsOf(driver));
    await clock.advance(499);
    await clock.advance(1);
    expect(await run).toEqual({
      error: { _tag: 'HttpTimeoutError', url: 'https://api.test/slow', timeoutMs: 500 },
    });
  });

  it('is not a timeout when the command itself aborts', async () => {
    const { fetch } = scripted('hang');
    const driver = makeHttpDriver({ fetch, baseUrl: 'https://api.test/', timeoutMs: 500 });
    const command = new AbortController();
    const run = outcome(
      Promise.resolve(driver.run({ url: 'slow' }, ctx(command.signal))),
      errorsOf(driver),
    );
    command.abort();
    const result = await run;
    expect(result.error?._tag).toBe('HttpNetworkError');
  });

  it('gives each retry attempt the full time', async () => {
    const { fetch, calls } = scripted('hang', 200);
    const driver = retry(makeHttpDriver({ fetch, baseUrl: 'https://api.test/', timeoutMs: 500 }), {
      times: 1,
      delayMs: 100,
      retryIf: retryableHttpError,
    });
    const run = Promise.resolve(driver.run({ url: 'x' }, ctx()));
    await clock.advance(600);
    expect(await run).toEqual({ status: 200 });
    expect(calls).toHaveLength(2);
    expect((calls[1] ?? 0) - (calls[0] ?? 0)).toBe(600); // 500 ms timeout + 100 ms delay
  });
});

describe('retry() policy', () => {
  it('retries only what retryIf accepts: 503 yes, 404 no', async () => {
    const flaky = scripted(503, 200);
    const api = retry(makeHttpDriver({ fetch: flaky.fetch, baseUrl: 'https://api.test/' }), {
      times: 2,
      retryIf: retryableHttpError,
    });
    const ok = Promise.resolve(api.run({ url: 'a' }, ctx()));
    await clock.advance(0);
    expect(await ok).toEqual({ status: 200 });
    expect(flaky.calls).toHaveLength(2);

    const missing = scripted(404, 200);
    const strict = retry(makeHttpDriver({ fetch: missing.fetch, baseUrl: 'https://api.test/' }), {
      times: 2,
      retryIf: retryableHttpError,
    });
    const result = await outcome(
      Promise.resolve(strict.run({ url: 'b' }, ctx())),
      errorsOf(strict),
    );
    expect(result.error).toMatchObject({ _tag: 'HttpStatusError', status: 404 });
    expect(missing.calls).toHaveLength(1);
  });

  it('retries network errors, 408 and 429', () => {
    const status = (s: number): HttpError => ({
      _tag: 'HttpStatusError',
      url: '',
      status: s,
      statusText: '',
      body: undefined,
    });
    expect(retryableHttpError({ _tag: 'HttpNetworkError', url: '', message: '' })).toBe(true);
    expect(retryableHttpError({ _tag: 'HttpTimeoutError', url: '', timeoutMs: 1 })).toBe(true);
    expect([408, 429, 500, 503].map((s) => retryableHttpError(status(s)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect([400, 401, 404, 422].map((s) => retryableHttpError(status(s)))).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(retryableHttpError({ _tag: 'HttpDecodeError', url: '', issues: [] })).toBe(false);
  });

  it('jitter waits a random part of the backoff delay', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const offline = scripted('offline', 'offline', 200);
    const api = retry(makeHttpDriver({ fetch: offline.fetch, baseUrl: 'https://api.test/' }), {
      times: 2,
      delayMs: 400,
      backoff: 'exponential',
      jitter: true,
    });
    const run = Promise.resolve(api.run({ url: 'c' }, ctx()));
    await clock.advance(1000);
    expect(await run).toEqual({ status: 200 });
    // 0.25 × 400, then 0.25 × 800
    expect(offline.calls.map((t, i, all) => (i === 0 ? 0 : t - (all[i - 1] ?? 0)))).toEqual([
      0, 100, 200,
    ]);
  });
});
