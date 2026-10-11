import { expect, it, vi } from 'vitest';
import { socketBrowser, socketText } from './websocket-server.js';

it('preserves native failed-handshake close metadata and maps encoding failures without closing a live socket', async () => {
  const host = await socketBrowser(() => undefined);
  try {
    await host.page.evaluate(
      (url) => {
        window.wsTest.start(url);
      },
      host.url.replace('/socket', '/missing'),
    );
    expect(await host.page.evaluate(() => window.wsTest.done())).toMatchObject({
      _tag: 'WebSocketClosedError',
      code: 1006,
      wasClean: false,
      errored: true,
      requested: false,
    });
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { encodeThrows: true });
    }, host.url);
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((v) => v._tag === 'WebSocketState' && v.state === 'open'),
    );
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'bad' }),
      ),
    ).toMatchObject({ _tag: 'WebSocketSendError', reason: 'encode', message: 'Encoder rejected.' });
    expect(await host.page.evaluate(() => window.wsTest.instances[1]?.readyState)).toBe(1);
    await host.page.evaluate(() => window.wsTest.abort());
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);

it('completes normal server closure and reports application close metadata without implicit reconnect', async () => {
  for (const code of [1000, 4002]) {
    let connections = 0;
    const host = await socketBrowser((socket) => {
      connections += 1;
      socket.close(code, 'server closed');
    });
    try {
      await host.page.evaluate((url) => {
        window.wsTest.start(url);
      }, host.url);
      const result = await host.page.evaluate(() => window.wsTest.done());
      expect(result).toMatchObject({
        _tag: code === 1000 ? 'WebSocketClosed' : 'WebSocketClosedError',
        code,
        reason: 'server closed',
        wasClean: true,
        requested: false,
      });
      expect(connections).toBe(1);
      expect(await host.page.evaluate(() => window.wsTest.instances.length)).toBe(1);
      expect(host.problems).toEqual([]);
    } finally {
      await host.stop();
    }
  }
}, 60_000);

it('reconnects only through retry, preserves ownership and never replays outgoing messages', async () => {
  let connections = 0;
  const received: string[] = [];
  const host = await socketBrowser((socket) => {
    const current = ++connections;
    if (current === 2) socket.send('9');
    socket.on('message', (data) => {
      received.push(socketText(data));
      if (current === 1) socket.close(4002, 'retry allowed');
    });
  });
  try {
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { retryDelay: 20 });
    }, host.url);
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((v) => v._tag === 'WebSocketState' && v.state === 'open'),
    );
    await host.page.evaluate(() =>
      window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'once' }),
    );
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((v) => v._tag === 'WebSocketMessage' && v.data === 9),
    );
    expect(connections).toBe(2);
    expect(received).toEqual(['once']);
    expect(await host.page.evaluate(() => window.wsTest.queued)).toEqual(['once']);
    expect(
      await host.page.evaluate(() =>
        window.wsTest.run({ _tag: 'Send', connection: 'live', value: 'after' }),
      ),
    ).toMatchObject({ _tag: 'WebSocketSent' });
    await vi.waitFor(() => {
      expect(received).toEqual(['once', 'after']);
    });
    await host.page.evaluate(() => {
      window.wsTest.instances[0]?.dispatchEvent(new MessageEvent('message', { data: '88' }));
    });
    expect(
      await host.page.evaluate(() =>
        window.wsTest.values.some((v) => v._tag === 'WebSocketMessage' && v.data === 88),
      ),
    ).toBe(false);
    await host.page.evaluate(() => window.wsTest.abort());
    await vi.waitFor(() => {
      expect(host.sockets.clients.size).toBe(0);
    });
    expect(await host.page.evaluate(() => window.wsTest.removed)).toEqual([
      'open',
      'message',
      'error',
      'close',
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

it('cancels an opt-in retry delay and never creates its next connection', async () => {
  let connections = 0;
  const host = await socketBrowser((socket) => {
    connections += 1;
    socket.close(4001, 'retry later');
  });
  try {
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { retryDelay: 500 });
    }, host.url);
    await host.page.waitForFunction(() =>
      window.wsTest.values.some((v) => v._tag === 'WebSocketClosed'),
    );
    await host.page.evaluate(() => window.wsTest.abort());
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(connections).toBe(1);
    expect(await host.page.evaluate(() => window.wsTest.instances.length)).toBe(1);
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);

it('orders async message decoding and cleans up listeners/socket on abort with late suppression', async () => {
  const host = await socketBrowser((socket) => {
    socket.send('1');
    socket.send('2');
  });
  try {
    await host.page.evaluate((url) => {
      window.wsTest.start(url, { delayed: true });
    }, host.url);
    await host.page.waitForFunction(() => window.wsTest.pending);
    expect(
      await host.page.evaluate(() =>
        window.wsTest.values.filter((v) => v._tag === 'WebSocketMessage'),
      ),
    ).toEqual([]);
    await host.page.evaluate(() => {
      window.wsTest.release(1);
    });
    await host.page.waitForFunction(
      () => window.wsTest.values.filter((v) => v._tag === 'WebSocketMessage').length === 2,
    );
    expect(
      await host.page.evaluate(() =>
        window.wsTest.values.flatMap((v) => (v._tag === 'WebSocketMessage' ? [v.data] : [])),
      ),
    ).toEqual([1, 2]);
    await host.page.evaluate(() => {
      window.wsTest.instances[0]?.dispatchEvent(new MessageEvent('message', { data: '1' }));
    });
    await host.page.waitForFunction(() => window.wsTest.pending);
    await host.page.evaluate(async () => {
      await window.wsTest.abort();
      window.wsTest.release(1);
      window.wsTest.instances[0]?.dispatchEvent(new MessageEvent('message', { data: '3' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      await host.page.evaluate(
        () => window.wsTest.values.filter((v) => v._tag === 'WebSocketMessage').length,
      ),
    ).toBe(2);
    expect(await host.page.evaluate(() => window.wsTest.removed)).toEqual([
      'open',
      'message',
      'error',
      'close',
    ]);
    expect(await host.page.evaluate(() => window.wsTest.closed)).toBe(1);
    await vi.waitFor(() => {
      expect(host.sockets.clients.size).toBe(0);
    });
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);
