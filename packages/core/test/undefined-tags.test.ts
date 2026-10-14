// Development warning for custom-element tags nothing defines (gyral-7se.35): an entry that
// never imports a component's module leaves its tag an unknown element that renders nothing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html, settled } from '../src/index.js';
import {
  checkUndefinedTags,
  UNDEFINED_GRACE_MS,
  watchUndefinedTags,
} from '../src/undefined-tags.js';

define()('test-undefined-host', {
  init: () => ({}),
  view: () =>
    html`<p>host</p>
      <test-undefined-inner></test-undefined-inner>`,
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const warnings = (): string[] => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  return warn.mock.calls as unknown as string[];
};

describe('undefined custom-element tags (development)', () => {
  it('warns once per tag, in the document and in shadow roots', async () => {
    const calls = warnings();
    document.body.innerHTML =
      '<test-undefined-page></test-undefined-page><test-undefined-host></test-undefined-host>';
    await settled();
    checkUndefinedTags();
    const text = calls.map((call) => String(call[0]));
    expect(text).toHaveLength(2);
    expect(text[0]).toContain('<test-undefined-page> is on the page');
    expect(text[0]).toContain("define()('test-undefined-page', …)");
    expect(text[1]).toContain('<test-undefined-inner>');
    // Defined tags (the host) are fine, and a tag is reported once.
    checkUndefinedTags();
    expect(calls).toHaveLength(2);
  });

  it('skips a tag defined by the time it looks', () => {
    const calls = warnings();
    document.body.innerHTML = '<test-undefined-late></test-undefined-late>';
    customElements.define('test-undefined-late', class extends HTMLElement {});
    checkUndefinedTags();
    expect(calls).toHaveLength(0);
  });

  it('looks a few seconds after define() on a loaded page', () => {
    vi.useFakeTimers();
    const calls = warnings();
    document.body.innerHTML = '<test-undefined-later></test-undefined-later>';
    watchUndefinedTags();
    watchUndefinedTags(); // one check scheduled at a time
    vi.advanceTimersByTime(UNDEFINED_GRACE_MS - 1);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('<test-undefined-later>'),
    ]);
  });
});
