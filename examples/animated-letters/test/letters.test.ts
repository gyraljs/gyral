import { afterEach, describe, expect, it } from 'vitest';
import { inputsFor, run, step, virtualTime, type VirtualTime } from '@gyral/testing';
import { time } from '@gyral/time';
import { AnimatedLetters, TRANSITION_MS, type State } from '../src/letters.js';

const state = (...keys: string[]): State => ({
  letters: keys.map((key) => ({ key: key.replace('-', ''), leaving: key.startsWith('-') })),
});

let clock: VirtualTime | undefined;

afterEach(() => {
  clock?.restore();
  clock = undefined;
  document.body.replaceChildren();
});

describe('model', () => {
  const { spec } = AnimatedLetters;

  it('adds letters in sorted order', () => {
    expect(step(spec, state('A', 'C'), { _tag: 'Key', letter: 'B' }).state).toEqual(
      state('A', 'B', 'C'),
    );
  });

  it('marks a present letter as leaving and schedules its removal', () => {
    const { state: next, commands } = step(spec, state('A', 'B'), { _tag: 'Key', letter: 'A' });
    expect(next).toEqual(state('-A', 'B'));
    expect(inputsFor(commands, time)).toEqual([{ _tag: 'Delay', ms: TRANSITION_MS }]);
    expect(commands[0]?.key).toBe('leave:A');
  });

  it('brings a leaving letter back and ignores its stale timer', () => {
    const final = run(
      spec,
      [
        { _tag: 'Key', letter: 'A' },
        { _tag: 'Key', letter: 'A' },
        { _tag: 'Gone', letter: 'A' },
      ],
      { state: state('A') },
    ).state;
    expect(final).toEqual(state('A'));
  });
});

describe('<gy-animated-letters>', () => {
  const press = (code: string) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  };
  const rendered = (el: HTMLElement) =>
    [...(el.shadowRoot?.querySelectorAll('li') ?? [])].map(
      (li) => `${li.classList.contains('out') ? '-' : ''}${li.textContent.trim()}`,
    );

  it('toggles letters from document key presses and drops them after the transition', async () => {
    clock = virtualTime();
    const el = document.createElement('gy-animated-letters');
    document.body.append(el);
    await el.updateComplete;
    await clock.advance(0);
    expect(rendered(el)).toEqual(['A', 'G', 'L', 'R', 'Y']);

    press('KeyB');
    press('KeyG');
    await el.updateComplete;
    expect(rendered(el)).toEqual(['A', 'B', '-G', 'L', 'R', 'Y']);

    await clock.advance(TRANSITION_MS);
    await el.updateComplete;
    expect(rendered(el)).toEqual(['A', 'B', 'L', 'R', 'Y']);
  });

  it('ignores modifier shortcuts and non-letter keys', async () => {
    clock = virtualTime();
    const el = document.createElement('gy-animated-letters');
    document.body.append(el);
    await el.updateComplete;
    await clock.advance(0);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyB', ctrlKey: true }));
    press('Digit1');
    press('Space');
    await el.updateComplete;
    expect(rendered(el)).toEqual(['A', 'G', 'L', 'R', 'Y']);
  });

  it('stops listening once removed', async () => {
    clock = virtualTime();
    const el = document.createElement('gy-animated-letters');
    document.body.append(el);
    await el.updateComplete;
    await clock.advance(0);
    el.remove();
    await clock.advance(0);
    press('KeyB');
    expect(el.state.letters.map((l) => l.key)).toEqual(['A', 'G', 'L', 'R', 'Y']);
  });
});
