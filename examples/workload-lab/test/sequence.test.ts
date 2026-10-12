import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { step, virtualTime, type VirtualTime } from '@gyral/testing';
import { Sequence } from '../src/sequence.js';

let timer: VirtualTime | undefined;
afterEach(() => {
  document.body.replaceChildren();
  timer?.restore();
  timer = undefined;
});
async function start() {
  const clock = virtualTime();
  timer = clock;
  const element = new Sequence();
  document.body.append(element);
  await settled();
  element.send({ _tag: 'Start' });
  await settled();
  return { clock, element };
}

describe('state-owned playback', () => {
  it('restarts adjacent equal durations and keeps elapsed time across unrelated updates', async () => {
    const { clock, element } = await start();
    await clock.advance(600);
    element.send({ _tag: 'Notes' });
    await settled();
    await clock.advance(399);
    expect(element.state.step).toBe(0);
    await clock.advance(1);
    expect(element.state.step).toBe(1);
    await clock.advance(999);
    expect(element.state.step).toBe(1);
    await clock.advance(1);
    expect(element.state.step).toBe(2);
    await clock.advance(1000);
    expect(element.state).toMatchObject({ step: 3, playing: false });
  });

  it('resumes a true detach with a full delay and keeps a synchronous move timer', async () => {
    const { clock, element } = await start();
    await clock.advance(600);
    element.remove();
    await settled();
    await clock.advance(10_000);
    expect(element.state.step).toBe(0);
    document.body.append(element);
    await settled();
    await clock.advance(999);
    expect(element.state.step).toBe(0);
    await clock.advance(1);
    expect(element.state.step).toBe(1);
    await clock.advance(600);
    const other = document.createElement('section');
    document.body.append(other);
    other.append(element);
    await settled();
    await clock.advance(399);
    expect(element.state.step).toBe(1);
    await clock.advance(1);
    expect(element.state.step).toBe(2);
  });

  it('rejects duplicates and late replies from replaced or stopped runs', async () => {
    const { element, clock } = await start();
    const first = element.state;
    await clock.advance(1000);
    expect(
      step(Sequence.spec, element.state, { _tag: 'Elapsed', run: first.run, step: 0 }).state,
    ).toBe(element.state);
    element.send({ _tag: 'Start' });
    await settled();
    element.send({ _tag: 'Elapsed', run: first.run, step: 1 });
    await settled();
    expect(element.state.step).toBe(0);
    element.send({ _tag: 'Stop' });
    await settled();
    const stopped = element.state;
    element.send({ _tag: 'Elapsed', run: stopped.run, step: 0 });
    await settled();
    expect(element.state).toBe(stopped);
  });
});
