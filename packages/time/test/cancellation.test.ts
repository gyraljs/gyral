import { afterEach, expect, it, vi } from 'vitest';
import { virtualTime, type VirtualTime } from '@gyral/testing';
import { makeTime } from '../src/driver.js';

let clock: VirtualTime | undefined;
afterEach(() => {
  clock?.restore();
  clock = undefined;
  vi.restoreAllMocks();
});

it('releases a completed delay from a long-lived abort signal', async () => {
  clock = virtualTime();
  const controller = new AbortController();
  const added = vi.spyOn(controller.signal, 'addEventListener');
  const removed = vi.spyOn(controller.signal, 'removeEventListener');
  const pending = makeTime().run(
    { _tag: 'Delay', ms: 20 },
    { signal: controller.signal, emit: () => undefined },
  );
  await clock.advance(20);
  await expect(pending).resolves.toBeUndefined();
  expect(removed).toHaveBeenCalledWith('abort', added.mock.calls[0]?.[1]);
});

it('stops every when its initial emission aborts the command', async () => {
  clock = virtualTime();
  const controller = new AbortController();
  const emitted: unknown[] = [];
  const pending = Promise.resolve(
    makeTime().run(
      { _tag: 'Every', ms: 10 },
      {
        signal: controller.signal,
        emit: (value) => {
          emitted.push(value);
          controller.abort();
        },
      },
    ),
  );
  const failure = pending.catch((error: unknown) => error);
  await clock.advance(50);
  expect(emitted).toHaveLength(1);
  expect(await failure).toMatchObject({ name: 'AbortError' });
});

it('stops requesting frames when an emission aborts the command', async () => {
  clock = virtualTime();
  const controller = new AbortController();
  const emitted: unknown[] = [];
  const pending = Promise.resolve(
    makeTime().run(
      { _tag: 'Frames' },
      {
        signal: controller.signal,
        emit: (value) => {
          emitted.push(value);
          controller.abort();
        },
      },
    ),
  );
  const failure = pending.catch((error: unknown) => error);
  await clock.advance(100);
  expect(emitted).toHaveLength(1);
  expect(await failure).toMatchObject({ name: 'AbortError' });
});
