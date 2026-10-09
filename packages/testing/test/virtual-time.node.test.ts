// virtualTime() in a Node project (no requestAnimationFrame): model and driver tests that need
// no DOM can still control timers.
import { afterEach, describe, expect, it } from 'vitest';
import { virtualTime, type VirtualTime } from '../src/index.js';

let clock: VirtualTime | undefined;
afterEach(() => {
  clock?.restore();
  clock = undefined;
});

describe('virtualTime() in Node', () => {
  it('installs without animation frames and advances timers and Date', async () => {
    expect(typeof globalThis.requestAnimationFrame).toBe('undefined');
    clock = virtualTime();
    const start = Date.now();
    const fired: number[] = [];
    setTimeout(() => fired.push(1), 100);
    setTimeout(() => fired.push(2), 300);
    await clock.advance(150);
    expect(fired).toEqual([1]);
    await clock.advance(200);
    expect(fired).toEqual([1, 2]);
    expect(Date.now() - start).toBe(350);
    expect(typeof globalThis.requestAnimationFrame).toBe('undefined');
  });
});
