// gyral-dyn.30: without the Navigation API the router loads its History API path with import().
// If that chunk can't load (offline, or a deploy removed it), navigations become full page
// loads instead of doing nothing.
import { describe, expect, it, vi } from 'vitest';
import { makeRouter } from '../src/index.js';

vi.mock('../src/internal/load-history.js', () => ({
  loadHistory: () => Promise.reject(new Error('chunk failed to load')),
}));

/** A window whose location records full page loads. */
function fakeWindow() {
  const assign = vi.fn<(href: string) => void>();
  const replace = vi.fn<(href: string) => void>();
  const location = {
    href: 'https://shop.example/',
    origin: 'https://shop.example',
    assign,
    replace,
  };
  const win = { location, history: { length: 1 }, document: { title: '' } };
  return { win: win as unknown as Window, assign, replace };
}

const run = (router: ReturnType<typeof makeRouter>, url: string, replace: boolean) =>
  router.run(
    { _tag: 'Navigate', url, replace },
    { signal: new AbortController().signal, emit: () => undefined },
  );

describe('router without the Navigation API, when the History API chunk fails to load', () => {
  it('turns a push into location.assign and a replace into location.replace', async () => {
    const { win, assign, replace } = fakeWindow();
    const router = makeRouter({ window: win, navigationApi: false });
    expect(await run(router, '/products?page=2', false)).toBeUndefined();
    expect(assign).toHaveBeenCalledWith('https://shop.example/products?page=2');
    await run(router, '/products?page=3', true);
    expect(replace).toHaveBeenCalledWith('https://shop.example/products?page=3');
    router.dispose(); // no unhandled rejection from the failed chunk
  });
});
