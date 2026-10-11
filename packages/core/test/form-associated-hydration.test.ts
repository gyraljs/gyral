import { afterEach, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { hydrated, mountSsr, type MountedSsr } from '../../testing/src/ssr.js';
import { settled } from '../src/index.js';

let page: MountedSsr | undefined;
afterEach(() => {
  page?.unmount();
  page = undefined;
});

it('keeps SSR fallback controls in place and submits exactly one value after hydration', async () => {
  const output = await commands.renderOnServer({
    module: './fixtures/form-associated.ts',
    export: 'page',
  });
  page = mountSsr(output);
  const form = page.root.querySelector('form');
  const input = page.root.querySelector('input');
  if (form === null || input === null) throw new Error('Missing server form');
  expect(new FormData(form).getAll('choice')).toEqual(['server']);
  input.value = 'typed before hydration';
  await import('./fixtures/form-associated.js');
  await hydrated(page);
  expect(page.root.querySelector('input')).toBe(input);
  expect(input.disabled).toBe(false);
  expect(new FormData(form).getAll('choice')).toEqual(['typed before hydration']);
  input.value = 'enhanced';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settled();
  expect(input.hasAttribute('name')).toBe(false);
  expect(input.disabled).toBe(false);
  expect(new FormData(form).getAll('choice')).toEqual(['enhanced']);
  form.reset();
  await settled();
  expect(new FormData(form).getAll('choice')).toEqual(['server']);
}, 60_000);
