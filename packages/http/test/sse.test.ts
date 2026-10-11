import { afterEach, expect, it } from 'vitest';
import * as v from 'valibot';
import { command, define, html, settled } from '@gyral/core';
import { fakeDriver } from '../../testing/src/fake.js';
import { makeEventSourceDriver, type EventSourceOutput } from '../src/sse.js';

const driver = makeEventSourceDriver(v.number());
type Msg = { readonly _tag: 'Feed'; readonly value: EventSourceOutput<number> };
const Feed = define<{ readonly number: number }, Msg>()('test-sse-fake', {
  init: () => ({ number: 0 }),
  subscriptions: () => [
    command(driver, { url: '/events' }, { onSuccess: (value) => ({ _tag: 'Feed', value }) }),
  ],
  update: {
    Feed: (s, m) => (m.value._tag === 'EventSourceMessage' ? { number: m.value.data } : s),
  },
  view: (s) => html`<output>${s.number}</output>`,
});
afterEach(() => {
  document.body.replaceChildren();
});
it('uses normal fake substitution and aborts a feed when its element disconnects', async () => {
  const fake = fakeDriver(driver);
  const el = new Feed();
  el.drivers = { sse: fake };
  document.body.append(el);
  await settled();
  expect(fake.inputs).toEqual([{ url: '/events' }]);
  fake.emitNext({
    _tag: 'EventSourceMessage',
    url: '/events',
    eventType: 'message',
    lastEventId: 'one',
    data: 42,
  });
  await settled();
  expect(el.state.number).toBe(42);
  el.remove();
  await Promise.resolve();
  expect(fake.calls[0]?.signal.aborted).toBe(true);
});
