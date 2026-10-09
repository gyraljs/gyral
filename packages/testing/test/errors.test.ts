// collectErrors() (ADR 0024): deliberate failures are collected instead of failing the run, and
// step() feeds Errored to its reducer.
import { describe, expect, it } from 'vitest';
import { define, GyralError, html, settled, type Errored } from '@gyral/core';
import { collectErrors, step } from '../src/index.js';

type Msg = { readonly _tag: 'Go' };
interface State {
  readonly failed: string | undefined;
}
const Panel = define<State, Msg>()('testing-err-panel', {
  intent: {},
  init: () => ({ failed: undefined }),
  update: {
    Go: () => {
      throw new Error('boom');
    },
    Errored: (_s, m) => ({ failed: m.error.msg }),
  },
  view: (s) => html`<p>${s.failed ?? 'ok'}</p>`,
});

describe('collectErrors()', () => {
  it('collects what Gyral reports, so the run stays green', async () => {
    const collected = collectErrors();
    try {
      const el = new Panel();
      document.body.append(el);
      el.send({ _tag: 'Go' });
      await settled();
      expect(el.shadowRoot?.textContent).toBe('Go');
    } finally {
      collected.stop();
      document.body.replaceChildren();
    }
    expect(collected.errors).toHaveLength(1);
    expect(collected.errors[0]).toBeInstanceOf(GyralError);
    expect(collected.errors[0]).toMatchObject({ phase: 'update', msg: 'Go' });
  });
});

describe('step() with Errored', () => {
  it('feeds Errored to its reducer', () => {
    const error = new GyralError('update', 'failed', new Error('boom'), 'testing-err-panel', 'Go');
    const msg: Errored = { _tag: 'Errored', phase: 'update', error };
    expect(step(Panel.spec, { failed: undefined }, msg).state).toEqual({ failed: 'Go' });
  });
});
