import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { makeEventSourceDriver } from '../src/sse.js';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { serveBrowser } from './browser-server.js';

const entry = resolve(import.meta.dirname, './fixtures/sse-browser.ts');
const schema: StandardSchemaV1 = {
  '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
};
it('supports a custom text parser and maps invalid native URLs to typed failures', async () => {
  const host = await serveBrowser(entry, (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: 01\n\n');
  });
  try {
    await host.page.evaluate(() => {
      window.sseTest.start('/feed', { plain: true });
    });
    await host.page.waitForFunction(() =>
      window.sseTest.values.some((v) => v._tag === 'EventSourceMessage'),
    );
    expect(
      await host.page.evaluate(() =>
        window.sseTest.values.find((v) => v._tag === 'EventSourceMessage'),
      ),
    ).toMatchObject({ data: 1, lastEventId: '' });
    expect(await host.page.evaluate(() => window.sseTest.instances[0]?.withCredentials)).toBe(
      false,
    );
    await host.page.evaluate(() => window.sseTest.abort());
    await host.page.evaluate(() => {
      window.sseTest.start('http://[');
    });
    expect(await host.page.evaluate(() => window.sseTest.abort())).toMatchObject({
      _tag: 'EventSourceError',
      url: 'http://[',
    });
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);
it('imports/creates EventSource drivers without browser globals', async () => {
  const driver = makeEventSourceDriver(schema);
  const result = await Promise.resolve(
    driver.run({ url: '/feed' }, { signal: new AbortController().signal, emit: () => undefined }),
  ).catch((cause: unknown) => driver.toError?.(cause));
  expect(result).toMatchObject({
    _tag: 'EventSourceError',
    url: '/feed',
    message: 'EventSource is unavailable.',
  });
});

it('decodes default/named events, preserves IDs and lets one native source reconnect with Last-Event-ID', async () => {
  const ids: (string | undefined)[] = [];
  let requests = 0;
  let closed = 0;
  const host = await serveBrowser(entry, (req, res) => {
    if (req.url !== '/feed') {
      res.writeHead(404).end();
      return;
    }
    requests += 1;
    ids.push(req.headers['last-event-id'] as string | undefined);
    res.on('close', () => {
      closed += 1;
    });
    res.setHeader('Content-Type', 'text/event-stream');
    if (requests === 1)
      res.end(
        'retry: 20\ndata: bad json\n\ndata: "wrong shape"\n\nid: first\ndata: 1\n\nid: second\nevent: notice\ndata: 2\n\n',
      );
    else res.write('id: third\nevent: error\ndata: 3\n\nid: fourth\nevent: open\ndata: 4\n\n');
  });
  try {
    await host.page.evaluate(() => {
      window.sseTest.start('/feed', { withCredentials: true });
    });
    await host.page.waitForFunction(
      () => window.sseTest.values.filter((v) => v._tag === 'EventSourceMessage').length === 4,
    );
    const values = await host.page.evaluate(() => window.sseTest.values);
    expect(
      values
        .filter((v) => v._tag === 'EventSourceMessage')
        .map((v) => [v.eventType, v.lastEventId, v.data]),
    ).toEqual([
      ['message', 'first', 1],
      ['notice', 'second', 2],
      ['error', 'third', 3],
      ['open', 'fourth', 4],
    ]);
    expect(values.filter((v) => v._tag === 'EventSourceDecodeFailed')).toHaveLength(2);
    expect(values.filter((v) => v._tag === 'EventSourceState').map((v) => v.state)).toEqual([
      'connecting',
      'open',
      'connecting',
      'open',
    ]);
    expect(ids).toEqual([undefined, 'second']);
    expect(await host.page.evaluate(() => window.sseTest.instances.length)).toBe(1);
    expect(await host.page.evaluate(() => window.sseTest.instances[0]?.withCredentials)).toBe(true);
    await host.page.evaluate(() => window.sseTest.abort());
    await vi.waitFor(() => {
      expect(closed).toBe(2);
    });
    expect(await host.page.evaluate(() => window.sseTest.closed)).toBe(1);
    expect(await host.page.evaluate(() => window.sseTest.removed)).toEqual([
      'open',
      'error',
      'message',
      'notice',
      'open',
      'error',
    ]);
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);

it('reports terminal CLOSED failure without creating another source', async () => {
  let requests = 0;
  const host = await serveBrowser(entry, (_req, res) => {
    requests += 1;
    res.writeHead(204).end();
  });
  try {
    await host.page.evaluate(() => {
      window.sseTest.start('/terminal');
    });
    await host.page.waitForFunction(() =>
      window.sseTest.values.some((v) => v._tag === 'EventSourceState' && v.state === 'closed'),
    );
    expect(await host.page.evaluate(() => window.sseTest.abort())).toMatchObject({
      _tag: 'EventSourceError',
    });
    expect(await host.page.evaluate(() => window.sseTest.closed)).toBe(1);
    expect(requests).toBe(1);
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);

it('orders async decoders and suppresses decoded and native late events after abort', async () => {
  const host = await serveBrowser(entry, (_req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.write('data: 1\n\ndata: 2\n\n');
  });
  try {
    await host.page.evaluate(() => {
      window.sseTest.start('/feed', { delayed: true });
    });
    await host.page.waitForFunction(() => window.sseTest.pending);
    expect(
      await host.page.evaluate(() =>
        window.sseTest.values.filter((v) => v._tag === 'EventSourceMessage'),
      ),
    ).toEqual([]);
    await host.page.evaluate(() => {
      window.sseTest.release(1);
    });
    await host.page.waitForFunction(
      () => window.sseTest.values.filter((v) => v._tag === 'EventSourceMessage').length === 2,
    );
    expect(
      await host.page.evaluate(() =>
        window.sseTest.values.flatMap((v) => (v._tag === 'EventSourceMessage' ? [v.data] : [])),
      ),
    ).toEqual([1, 2]);
    await host.page.evaluate(async () => {
      window.sseTest.instances[0]?.dispatchEvent(new MessageEvent('message', { data: '1' }));
      await Promise.resolve();
    });
    await host.page.waitForFunction(() => window.sseTest.pending);
    await host.page.evaluate(async () => {
      await window.sseTest.abort();
      window.sseTest.release(1);
      window.sseTest.instances[0]?.dispatchEvent(new MessageEvent('notice', { data: '3' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      await host.page.evaluate(
        () => window.sseTest.values.filter((v) => v._tag === 'EventSourceMessage').length,
      ),
    ).toBe(2);
    expect(host.problems).toEqual([]);
  } finally {
    await host.stop();
  }
}, 60_000);
