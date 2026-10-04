import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Command, Driver } from '@gyral/core';
import type { HttpError, HttpRequest } from '@gyral/http';
import { searchUrl } from '../src/github.js';
import { GithubSearch, type Msg, type State } from '../src/search.js';

const repo = (id: number, name: string) => ({
  id,
  full_name: `gyral/${name}`,
  html_url: `https://github.com/gyral/${name}`,
  description: `About ${name}`,
  stargazers_count: id * 1000,
});

class FakeFailure extends Error {
  constructor(readonly error: HttpError) {
    super(error._tag);
  }
}

/** Fake http driver: every request waits until the test answers it. No network. */
function fakeGithub() {
  const calls: {
    url: string;
    signal: AbortSignal;
    reply: (items: unknown[]) => void;
    fail: (error: HttpError) => void;
  }[] = [];
  const driver: Driver<HttpRequest, unknown, HttpError> = {
    name: 'http',
    toError: (cause) =>
      cause instanceof FakeFailure
        ? cause.error
        : { _tag: 'HttpNetworkError', url: '', message: String(cause) },
    run: (req, { signal }) =>
      new Promise((resolve, reject) => {
        calls.push({
          url: req.url,
          signal,
          reply: (items) => {
            resolve({ items });
          },
          fail: (error) => {
            reject(new FakeFailure(error));
          },
        });
      }),
  };
  return { driver, calls };
}

/** Debounce substitute that fires immediately, so tests need no timers. */
const instant: Driver<{ readonly ms: number }, undefined> = {
  name: 'debounce',
  concurrency: 'switch',
  run: () => undefined,
};

async function mount() {
  const github = fakeGithub();
  const el = new GithubSearch();
  el.drivers = { http: github.driver, debounce: instant };
  document.body.append(el);
  await el.updateComplete;
  return { el, github };
}

function type(el: HTMLElement, text: string) {
  const input = el.shadowRoot?.querySelector('input');
  if (!input) throw new Error('missing input');
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

const shadowText = (el: HTMLElement, selector: string) =>
  [...(el.shadowRoot?.querySelectorAll(selector) ?? [])].map((n) => n.textContent.trim());

afterEach(() => {
  document.body.replaceChildren();
});

describe('<gy-github-search>', () => {
  it('searches after typing and renders results as links', async () => {
    const { el, github } = await mount();
    type(el, 'lit');
    await vi.waitFor(() => {
      expect(github.calls.map((c) => c.url)).toEqual([searchUrl('lit')]);
    });
    expect(shadowText(el, 'output')).toEqual(['Searching…']);
    github.calls[0]?.reply([repo(1, 'lit'), repo(2, 'lit-ssr')]);
    await vi.waitFor(() => {
      expect(shadowText(el, 'h2 a')).toEqual(['gyral/lit', 'gyral/lit-ssr']);
    });
    expect(shadowText(el, 'output')).toEqual(['2 repositories']);
    expect(el.shadowRoot?.querySelector('a')?.getAttribute('href')).toBe(
      'https://github.com/gyral/lit',
    );
  });

  it('cancels a stale search when the query changes (switch)', async () => {
    const { el, github } = await mount();
    type(el, 'a');
    await vi.waitFor(() => {
      expect(github.calls).toHaveLength(1);
    });
    type(el, 'ab');
    await vi.waitFor(() => {
      expect(github.calls).toHaveLength(2);
    });
    expect(github.calls[0]?.signal.aborted).toBe(true);
    github.calls[0]?.reply([repo(9, 'stale')]);
    github.calls[1]?.reply([repo(3, 'ab')]);
    await vi.waitFor(() => {
      expect(shadowText(el, 'h2 a')).toEqual(['gyral/ab']);
    });
  });

  it('shows failures as an alert', async () => {
    const { el, github } = await mount();
    type(el, 'x');
    await vi.waitFor(() => {
      expect(github.calls).toHaveLength(1);
    });
    github.calls[0]?.fail({ _tag: 'HttpStatusError', url: '', status: 403, statusText: '' });
    await vi.waitFor(() => {
      expect(shadowText(el, '[role=alert]')).toEqual([
        'GitHub rate limit reached. Try again in a minute.',
      ]);
    });
  });

  it('does not search for blank input', async () => {
    const { el, github } = await mount();
    type(el, '   ');
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 10));
    expect(github.calls).toHaveLength(0);
    expect(shadowText(el, 'output')).toEqual(['Type to search.']);
  });

  it('update debounces typing through a command', () => {
    const { update } = GithubSearch.spec;
    const idle: State = { query: '', results: { _tag: 'Idle' } };
    const next = update.Typed(idle, { _tag: 'Typed', query: 'q' });
    const [state, commands] = next as readonly [State, readonly Command<Msg>[]];
    expect(state.query).toBe('q');
    expect(commands.map((c) => c.driver.name)).toEqual(['debounce']);
  });
});
