import { describe, expect, it } from 'vitest';
import { command, define, defineDriver, html } from '@gyral/core';
import { inputsFor, subscriptionsFor } from '../src/index.js';

const feed = defineDriver<string, number>({ name: 'feed', run: () => 0 });

type Msg = { readonly _tag: 'Value'; readonly n: number };
interface State {
  readonly live: boolean;
}

const Ticker = define<State, Msg, { channel: string }>()('test-subs-for', {
  init: () => ({ live: true }),
  subscriptions: (s, p) =>
    s.live ? [command(feed, p.channel, { onSuccess: (n): Msg => ({ _tag: 'Value', n }) })] : [],
  intent: {},
  update: { Value: (s) => s },
  view: () => html``,
});

describe('subscriptionsFor', () => {
  it('returns what subscriptions asks to keep running, without a DOM', () => {
    expect(
      inputsFor(subscriptionsFor(Ticker.spec, { live: true }, { channel: 'a' }), feed),
    ).toEqual(['a']);
    expect(subscriptionsFor(Ticker.spec, { live: false }, { channel: 'a' })).toEqual([]);
  });

  it('a spec without subscriptions gives none', () => {
    const Plain = define<State, Msg>()('test-subs-for-plain', {
      init: () => ({ live: true }),
      intent: {},
      update: { Value: (s) => s },
      view: () => html``,
    });
    expect(subscriptionsFor(Plain.spec, { live: true })).toEqual([]);
  });
});
