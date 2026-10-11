import { afterEach, expect, it } from 'vitest';
import * as v from 'valibot';
import { command, define, html, settled } from '@gyral/core';
import { fakeDriver } from '../../testing/src/fake.js';
import { makeWebSocketDriver, type WebSocketOutput } from '../src/websocket.js';

const socket = makeWebSocketDriver(v.number(), { encode: (value: string) => value });
type Msg =
  | { readonly _tag: 'Send'; readonly value: string }
  | { readonly _tag: 'Socket'; readonly value: WebSocketOutput<number> };
const Chat = define<{ readonly heard: number; readonly bytes: number }, Msg>()(
  'test-websocket-fake',
  {
    init: () => ({ heard: 0, bytes: 0 }),
    subscriptions: () => [
      command(
        socket,
        { _tag: 'Connect', connection: 'chat', url: 'ws://example.test' },
        { key: 'chat-connect', onSuccess: (value) => ({ _tag: 'Socket', value }) },
      ),
    ],
    update: {
      Send: (s, m) => [
        s,
        [
          command(
            socket,
            { _tag: 'Send', connection: 'chat', value: m.value },
            { key: 'chat-send', onSuccess: (value) => ({ _tag: 'Socket', value }) },
          ),
        ],
      ],
      Socket: (s, m) =>
        m.value._tag === 'WebSocketMessage'
          ? { ...s, heard: m.value.data }
          : m.value._tag === 'WebSocketSent'
            ? { ...s, bytes: m.value.bytes }
            : s,
    },
    view: (s) => html`<output>${s.heard} · ${s.bytes}</output>`,
  },
);
afterEach(() => {
  document.body.replaceChildren();
});
it('substitutes receive and send on the same fake and cancels ownership with the component', async () => {
  const fake = fakeDriver(socket);
  const el = new Chat();
  el.drivers = { websocket: fake };
  document.body.append(el);
  await settled();
  fake.emitNext({ _tag: 'WebSocketMessage', connection: 'chat', data: 7 });
  await settled();
  expect(el.state.heard).toBe(7);
  el.send({ _tag: 'Send', value: 'hello' });
  expect(fake.inputs).toEqual([
    { _tag: 'Connect', connection: 'chat', url: 'ws://example.test' },
    { _tag: 'Send', connection: 'chat', value: 'hello' },
  ]);
  fake.calls[1]?.resolve({ _tag: 'WebSocketSent', connection: 'chat', bytes: 5 });
  await settled();
  expect(el.state.bytes).toBe(5);
  el.remove();
  await Promise.resolve();
  expect(fake.calls[0]?.signal.aborted).toBe(true);
});
