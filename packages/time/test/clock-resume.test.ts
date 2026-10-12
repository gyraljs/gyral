import { afterEach, describe, expect, it } from 'vitest';
import { define, html, settled } from '@gyral/core';
import { virtualTime, type VirtualTime } from '@gyral/testing';
import { every } from '../src/index.js';

type State = { readonly live: boolean; readonly count: number; readonly last: number | undefined };
type Msg = { readonly _tag: 'Tick'; readonly now: number } | { readonly _tag: 'Toggle' };
const Clock = define<State, Msg>()('test-clock-resume', {
  init: () => ({ live: true, count: 0, last: undefined }),
  subscriptions: (s) => (s.live ? [every(1000, (now) => ({ _tag: 'Tick', now }))] : []),
  update: {
    Tick: (s, m) => ({ ...s, count: s.count + 1, last: m.now }),
    Toggle: (s) => ({ ...s, live: !s.live }),
  },
  view: (s) => html`<output>${s.count}</output>`,
});
let timer: VirtualTime | undefined;
afterEach(() => {
  document.body.replaceChildren();
  timer?.restore();
  timer = undefined;
});

describe('clock migration semantics', () => {
  it('counts immediate emissions separately from epoch times and restarts the interval on resume', async () => {
    const clock = virtualTime();
    timer = clock;
    const element = new Clock();
    document.body.append(element);
    await settled();
    const start = clock.now();
    expect(element.state).toMatchObject({ count: 1, last: start });
    await clock.advance(1000);
    expect(element.state).toMatchObject({ count: 2, last: start + 1000 });
    element.send({ _tag: 'Toggle' });
    await settled();
    await clock.advance(5000);
    expect(element.state).toMatchObject({ count: 2, last: start + 1000 });
    element.send({ _tag: 'Toggle' });
    await settled();
    expect(element.state).toMatchObject({ count: 3, last: start + 6000 });
    await clock.advance(999);
    expect(element.state.count).toBe(3);
    await clock.advance(1);
    expect(element.state).toMatchObject({ count: 4, last: start + 7000 });
  });
});
