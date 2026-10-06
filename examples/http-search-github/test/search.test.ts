import { afterEach, describe, expect, it, vi } from 'vitest';
import { settled } from '@gyral/core';
import type { HttpError, HttpRequest } from '@gyral/http';
import {
  fakeDriver,
  inputsFor,
  resolve,
  step,
  virtualTime,
  type VirtualTime,
} from '@gyral/testing';
import { time as timeDriver } from '@gyral/time';
import { searchUrl } from '../src/github.js';
import { DEBOUNCE_MS, GithubSearch, type State } from '../src/search.js';

const repo = (id: number, name: string) => ({
  id,
  full_name: `gyral/${name}`,
  html_url: `https://github.com/gyral/${name}`,
  description: `About ${name}`,
  stargazers_count: id * 1000,
});

async function mount({ realDebounce = false } = {}) {
  // Every request waits until the test answers it. No network.
  const github = fakeDriver<HttpRequest, unknown, HttpError>('http');
  const el = new GithubSearch();
  el.drivers = realDebounce
    ? { http: github }
    : { http: github, time: fakeDriver(timeDriver, { impl: () => undefined }) };
  document.body.append(el);
  await settled();
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

let time: VirtualTime | undefined;

afterEach(() => {
  time?.restore();
  time = undefined;
  document.body.replaceChildren();
});

describe('<gy-github-search>', () => {
  it('searches after typing and renders results as links', async () => {
    const { el, github } = await mount();
    type(el, 'lit');
    await vi.waitFor(() => {
      expect(github.inputs.map((r) => r.url)).toEqual([searchUrl('lit')]);
    });
    expect(shadowText(el, 'output')).toEqual(['Searching…']);
    github.resolveNext({ items: [repo(1, 'lit'), repo(2, 'lit-ssr')] });
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
    github.calls[0]?.resolve({ items: [repo(9, 'stale')] });
    github.calls[1]?.resolve({ items: [repo(3, 'ab')] });
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
    github.rejectNext({ _tag: 'HttpStatusError', url: '', status: 403, statusText: '' });
    await vi.waitFor(() => {
      expect(shadowText(el, '[role=alert]')).toEqual([
        'GitHub rate limit reached. Try again in a minute.',
      ]);
    });
  });

  it('does not search for blank input', async () => {
    const { el, github } = await mount();
    type(el, '   ');
    await settled();
    await new Promise((r) => setTimeout(r, 10));
    expect(github.calls).toHaveLength(0);
    expect(shadowText(el, 'output')).toEqual(['Type to search.']);
  });

  it('waits for a pause in typing (virtual time, real debounce driver)', async () => {
    time = virtualTime();
    const { el, github } = await mount({ realDebounce: true });
    type(el, 'l');
    await time.advance(DEBOUNCE_MS - 1);
    type(el, 'li');
    await time.advance(DEBOUNCE_MS - 1);
    expect(github.calls).toHaveLength(0);
    await time.advance(1);
    expect(github.inputs.map((r) => r.url)).toEqual([searchUrl('li')]);
  });

  it('update debounces typing through a command', () => {
    const idle: State = { query: '', results: { _tag: 'Idle' } };
    const { state, commands } = step(GithubSearch.spec, idle, { _tag: 'Typed', query: 'q' });
    expect(state.query).toBe('q');
    expect(inputsFor(commands, timeDriver)).toEqual([{ _tag: 'Delay', ms: DEBOUNCE_MS }]);
    const [pause] = commands;
    if (pause === undefined) throw new Error('no command');
    expect(resolve(pause, undefined)).toEqual({ _tag: 'Search', query: 'q' });
  });
});
