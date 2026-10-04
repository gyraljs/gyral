import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpError, HttpRequest } from '@gyral/http';
import { fakeDriver, run, step } from '@gyral/testing';
import { time } from '@gyral/time';
import { Autocomplete, move, type State } from '../src/autocomplete.js';
import { suggestUrl } from '../src/wikipedia.js';

const base: State = {
  query: 'cy',
  suggestions: ['Cycle', 'Cyclone', 'Cypress'],
  highlighted: undefined,
  open: true,
  status: 'idle',
};

describe('model', () => {
  it('wraps the highlight around in both directions', () => {
    expect(move(base, 1).highlighted).toBe(0);
    expect(move(base, -1).highlighted).toBe(2);
    expect(move({ ...base, highlighted: 2 }, 1).highlighted).toBe(0);
    expect(move({ ...base, suggestions: [] }, 1)).toEqual({ ...base, suggestions: [] });
  });

  it('selects the highlighted title on Enter and closes', () => {
    const { state } = run(
      Autocomplete.spec,
      [
        { _tag: 'Key', key: 'ArrowDown' },
        { _tag: 'Key', key: 'ArrowDown' },
        { _tag: 'Key', key: 'Enter' },
      ],
      { state: base },
    );
    expect(state).toMatchObject({ query: 'Cyclone', open: false, suggestions: [] });
  });

  it('ignores answers for an older query', () => {
    const { state } = step(Autocomplete.spec, base, {
      _tag: 'Found',
      query: 'c',
      titles: ['Cat'],
    });
    expect(state).toBe(base);
  });

  it('clears instead of searching when the field is emptied', () => {
    const { state, commands } = step(Autocomplete.spec, base, { _tag: 'Typed', query: '' });
    expect(state).toMatchObject({ query: '', suggestions: [], open: false });
    expect(commands).toEqual([]);
  });
});

describe('<gy-autocomplete>', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  async function mount() {
    const http = fakeDriver<HttpRequest, unknown, HttpError>('http');
    const el = new Autocomplete();
    // Debounce fires at once; requests wait until the test answers them. No network.
    el.drivers = { http, time: fakeDriver(time, { impl: () => undefined }) };
    document.body.append(el);
    await el.updateComplete;
    const $ = <T extends Element>(sel: string, type: new () => T): T => {
      const found = el.shadowRoot?.querySelector(sel);
      if (!(found instanceof type)) throw new Error(`missing ${sel}`);
      return found;
    };
    const input = $('#query', HTMLInputElement);
    const list = $('[role=listbox]', HTMLUListElement);
    const type = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      await vi.waitFor(() => {
        expect(http.inputs.at(-1)?.url).toBe(suggestUrl(text));
      });
    };
    const answer = async (query: string, titles: string[]) => {
      http.resolveNext([query, titles, [], []]);
      await vi.waitFor(() => {
        expect(el.state.status).toBe('idle');
      });
      await el.updateComplete;
    };
    const key = async (k: string) => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
      await el.updateComplete;
    };
    const options = () => [...list.querySelectorAll('[role=option]')];
    return { el, http, input, list, type, answer, key, options };
  }

  it('suggests titles as a listbox the combobox controls', async () => {
    const { input, list, type, answer, options } = await mount();
    await type('cy');
    await answer('cy', ['Cycle', 'Cyclone']);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect(options().map((o) => o.textContent.trim())).toEqual(['Cycle', 'Cyclone']);
    await vi.waitFor(() => {
      expect(list.matches(':popover-open')).toBe(true); // Chromium takes the enhanced path
    });
  });

  it('navigates with the arrow keys and picks with Enter', async () => {
    const { el, input, type, answer, key, options } = await mount();
    await type('cy');
    await answer('cy', ['Cycle', 'Cyclone', 'Cypress']);
    await key('ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe('option-2');
    expect(options()[2]?.getAttribute('aria-selected')).toBe('true');
    await key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe('option-0');
    await key('Enter');
    expect(input.value).toBe('Cycle');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(el.state.suggestions).toEqual([]);
  });

  it('closes on Escape and picks on click', async () => {
    const { el, input, list, type, answer, key, options } = await mount();
    await type('cy');
    await answer('cy', ['Cycle', 'Cyclone']);
    await key('Escape');
    expect(list.hidden).toBe(true);
    await key('ArrowDown');
    expect(list.hidden).toBe(false);
    (options()[1] as HTMLElement).click();
    await el.updateComplete;
    expect(input.value).toBe('Cyclone');
  });

  it('cancels the request for a query that was typed over', async () => {
    const { http, type, answer, options } = await mount();
    await type('c');
    await type('cy');
    expect(http.calls[0]?.signal.aborted).toBe(true);
    await answer('cy', ['Cycle']);
    expect(options()).toHaveLength(1);
  });

  it('reports failures in the status region', async () => {
    const { el, http, type } = await mount();
    await type('cy');
    const error: HttpError = {
      _tag: 'HttpNetworkError',
      url: suggestUrl('cy'),
      message: 'offline',
    };
    http.rejectNext(error);
    await vi.waitFor(() => {
      expect(el.state.status).toBe('error');
    });
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('[role=status]')?.textContent).toContain('unavailable');
  });
});
