import { afterEach, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { makeWebSocketDriver } from '../src/websocket.js';
import { socketBrowser, socketText } from './websocket-server.js';

afterEach(() => {
  vi.unstubAllGlobals();
});
it('constructs without browser globals, reports unavailable native transport and checks buffer configuration', async () => {
  vi.stubGlobal('WebSocket', undefined);
  const driver = makeWebSocketDriver(v.number(), { encode: (value: string) => value });
  const failure = await Promise.resolve(
    driver.run(
      { _tag: 'Connect', connection: 'ssr', url: 'ws://example.test' },
      { signal: new AbortController().signal, emit: () => undefined },
    ),
  ).catch((cause: unknown) => driver.toError?.(cause));
  expect(failure).toMatchObject({
    _tag: 'WebSocketConnectError',
    message: 'WebSocket is unavailable.',
  });
  for (const maxBufferedBytes of [-1, 1.5, Infinity, NaN])
    expect(() =>
      makeWebSocketDriver(v.number(), { encode: (value: string) => value, maxBufferedBytes }),
    ).toThrow(RangeError);
});

it('connects, validates messages, sends on the same socket and completes an explicit application close', async () => {
  const received: string[] = [];
  let connectionCount = 0;
  const host = await socketBrowser((socket) => {
    connectionCount += 1;
    socket.send('bad json');
    socket.send('"wrong shape"');
    socket.send('1');
    socket.on('message', (data) => {
      received.push(socketText(data));
      socket.send('2');
    });
  });
  try {
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { protocols: ['gyral-test'] });
    }, host.url);
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((value) => value._tag === 'WebSocketMessage'),
    );
    expect(
      await host.page.evaluate(
        () => window.wsTest.values.filter((value) => value._tag === 'WebSocketDecodeFailed').length,
      ),
    ).toBe(2);
    expect(await host.page.evaluate(() => window.wsTest.instances[0]?.protocol)).toBe('gyral-test');
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'hello' }),
      ),
    ).toEqual({ _tag: 'WebSocketSent', connection: 'live', bytes: 5 });
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((value) => value._tag === 'WebSocketMessage' && value.data === 2),
    );
    expect(received).toEqual(['hello']);
    expect(connectionCount).toBe(1);
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'x'.repeat(65537) }),
      ),
    ).toMatchObject({
      _tag: 'WebSocketSendError',
      reason: 'buffer-limit',
      bytes: 65537,
      limit: 65536,
    });
    expect(
      await host.page.evaluate(
        (url) => window.wsTest.run({ _tag: 'Connect', connection: 'live', url }),
        host.url,
      ),
    ).toMatchObject({ _tag: 'WebSocketConnectError', message: 'Connection ID is already owned.' });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Close', connection: 'live', code: 2000 }),
      ),
    ).toMatchObject({ _tag: 'WebSocketCloseError' });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Close', connection: 'live', code: 3001, reason: 'finished' }),
      ),
    ).toEqual({ _tag: 'WebSocketCloseRequested', connection: 'live' });
    expect(await host.page.evaluate(() => window.wsTest.done())).toMatchObject({
      _tag: 'WebSocketClosed',
      code: 3001,
      reason: 'finished',
      wasClean: true,
      requested: true,
    });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'late' }),
      ),
    ).toMatchObject({ _tag: 'WebSocketSendError', reason: 'not-open' });
    expect(await host.page.evaluate(() => window.wsTest.removed)).toEqual([
      'open',
      'message',
      'error',
      'close',
    ]);
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);

it('supports binary codecs and counts exact Blob, view and ArrayBuffer bytes', async () => {
  const received: number[][] = [];
  const host = await socketBrowser((socket) => {
    socket.send(Buffer.from([7]), { binary: true });
    socket.on('message', (data, binary) => {
      if (binary && Buffer.isBuffer(data)) received.push([...data]);
    });
  });
  try {
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { binary: true });
    }, host.url);
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((value) => value._tag === 'WebSocketMessage' && value.data === 7),
    );
    expect(
      await host.page.evaluate(async () => {
        const payloads = [
          new Uint8Array([1, 2]).buffer,
          new Uint8Array([3, 4, 5]).subarray(1),
          new Blob([new Uint8Array([6])]),
        ];
        const results = [];
        for (const value of payloads)
          results.push(await window.wsTest.run({ _tag: 'Send', connection: 'live', value }));
        return results;
      }),
    ).toMatchObject([{ bytes: 2 }, { bytes: 2 }, { bytes: 1 }]);
    await vi.waitFor(() => {
      expect(received).toEqual([[1, 2], [4, 5], [6]]);
    });
    await host.page.evaluate(() => window.wsTest.abort());
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);

it('rejects combined buffered bytes and UTF-8 over-limit sends without closing or queueing them', async () => {
  const received: string[] = [];
  const host = await socketBrowser((socket) => {
    socket.on('message', (data) => {
      received.push(socketText(data));
    });
  });
  try {
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { limit: 10 });
    }, host.url);
    await host.page.waitForFunction(() =>
      window.wsTest.values.some(
        (value) => value._tag === 'WebSocketState' && value.state === 'open',
      ),
    );
    expect(
      await host.page.evaluate(() => {
        window.wsTest.instances[0]?.send('12345678');
        return window.wsTest.run({ _tag: 'Send', connection: 'live', value: '123' });
      }),
    ).toMatchObject({
      _tag: 'WebSocketSendError',
      reason: 'buffer-limit',
      bufferedBytes: 8,
      bytes: 3,
      limit: 10,
    });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: '€€€€' }),
      ),
    ).toMatchObject({ _tag: 'WebSocketSendError', reason: 'buffer-limit', bytes: 12 });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'missing', value: 'x' }),
      ),
    ).toMatchObject({ reason: 'not-open' });
    await vi.waitFor(() => {
      expect(received).toEqual(['12345678']);
    });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'ok' }),
      ),
    ).toMatchObject({ _tag: 'WebSocketSent', bytes: 2 });
    await vi.waitFor(() => {
      expect(received).toEqual(['12345678', 'ok']);
    });
    await host.page.evaluate(() => window.wsTest.abort());
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);
