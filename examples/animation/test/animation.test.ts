import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { step } from '@gyral/testing';
import { Animation, DURATION_MS, keyframes, path } from '../src/animation.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('path', () => {
  it('goes right, down, then curves back to the start', () => {
    const stops = path();
    expect(stops[0]).toMatchObject({ at: 0, x: 0, y: 0 });
    expect(stops[1]).toMatchObject({ x: 1, y: 0 });
    expect(stops[2]).toMatchObject({ x: 1, y: 1 });
    expect(stops.at(-1)).toMatchObject({ at: 1, x: 0, y: 0 });
    // Every arc point stays on the circle centred at (1, 0) with radius 1.
    for (const s of stops.slice(2)) expect(Math.hypot(s.x - 1, s.y)).toBeCloseTo(1, 3);
    const times = stops.map((s) => s.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('renders as CSS keyframes', () => {
    const css = keyframes(path());
    expect(css).toMatch(/^@keyframes travel \{ 0\.00% \{ translate:/);
    expect(css).toContain('100.00% { translate: calc(var(--travel) * 0) calc(var(--travel) * 0)');
  });
});

describe('<gy-animation>', () => {
  it('counts runs purely', () => {
    expect(step(Animation.spec, { runs: 2 }, { _tag: 'Animate' }).state).toEqual({ runs: 3 });
  });

  it('starts a fresh CSS animation on every click', async () => {
    const el = document.createElement('gy-animation');
    document.body.append(el);
    await settled();
    const target = () => el.shadowRoot?.querySelector('.target');
    const first = target();
    expect(first?.getAnimations()).toEqual([]);

    el.shadowRoot?.querySelector('button')?.click();
    await settled();
    const second = target();
    expect(second).not.toBe(first);
    const [animation] = second?.getAnimations() ?? [];
    expect(animation).toBeInstanceOf(CSSAnimation);
    expect((animation as CSSAnimation).animationName).toMatch(/^(travel|flash)$/);

    el.shadowRoot?.querySelector('button')?.click();
    await settled();
    expect(target()).not.toBe(second);
    expect(el.state.runs).toBe(2);
  });

  it('keeps the original timing', () => {
    expect(DURATION_MS).toBe(2600);
  });
});
