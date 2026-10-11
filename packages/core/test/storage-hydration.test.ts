import { afterEach, expect, it, vi } from 'vitest';
import { commands } from 'vitest/browser';
import { fakeDriver } from '../../testing/src/fake.js';
import { hydrated, mountSsr, type MountedSsr } from '../../testing/src/ssr.js';
import { settled } from '../src/index.js';

let mounted: MountedSsr | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  localStorage.removeItem('gyral-ssr-storage:theme');
  document.body.replaceChildren();
});

it('hydrates the server value in place before starting storage, then applies persisted data', async () => {
  localStorage.setItem('gyral-ssr-storage:theme', '"browser"');
  mounted = mountSsr(
    await commands.renderOnServer({ module: './fixtures/storage.ts', export: 'page' }),
  );
  const output = mounted.root.querySelector('output');
  expect(output?.textContent).toBe('server');
  const fixture = await import('./fixtures/storage.js');
  await hydrated(mounted);
  await vi.waitFor(() => {
    expect(output?.textContent).toBe('browser');
  });
  expect(fixture.firstStorageAccess).toBe('server');
  expect(mounted.root.querySelector('output')).toBe(output);
}, 60_000);

it('substitutes the driver by name and cancels its watch on disconnect', async () => {
  const { Settings, storage } = await import('./fixtures/storage.js');
  const fake = fakeDriver(storage);
  const el = new Settings();
  el.drivers = { [storage.name]: fake };
  document.body.append(el);
  await settled();
  expect(fake.inputs).toEqual([{ _tag: 'Watch', key: 'theme' }]);
  fake.emitNext({
    _tag: 'StorageChanged',
    key: 'theme',
    source: 'initial',
    entry: { found: true, value: 'fake' },
  });
  await settled();
  expect(el.state.value).toBe('fake');
  el.remove();
  await Promise.resolve();
  expect(fake.calls[0]?.signal.aborted).toBe(true);
});
