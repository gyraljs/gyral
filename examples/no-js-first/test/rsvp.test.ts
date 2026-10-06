import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeHttpDriver } from '@gyral/http';
import { initial, step } from '@gyral/testing';
import { Rsvp } from '../src/rsvp.js';

const props = { attendees: [{ name: 'Grace', guests: 1 }], joined: undefined };

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(answer: () => Response = () => Response.json({})) {
  const fetch = vi.fn(() => Promise.resolve(answer()));
  const el = document.createElement('gy-rsvp');
  el.attendees = props.attendees;
  el.drivers = { http: makeHttpDriver({ fetch, baseUrl: 'http://localhost/' }) };
  document.body.append(el);
  await el.updateComplete;
  const root = el.shadowRoot;
  const input = (name: string) => root?.querySelector<HTMLInputElement>(`[name=${name}]`);
  const type = (name: string, value: string) => {
    const field = input(name);
    if (field === null || field === undefined) throw new Error(`no field ${name}`);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  };
  return { el, root, type, fetch };
}

describe('no-js-first with JavaScript on', () => {
  it('the Hydrated reducer switches the form to enhanced, as a pure step', () => {
    const start = initial(Rsvp.spec, props).state;
    expect(start.enhanced).toBe(false);
    const live = step(Rsvp.spec, start, { _tag: 'Hydrated', serverRendered: true });
    expect(live.state.enhanced).toBe(true);
    expect(live.commands).toEqual([]);
  });

  it('starts as the server renders it and switches on once live in the browser', async () => {
    expect(initial(Rsvp.spec, props).state.enhanced).toBe(false);
    const { el, root } = await mount();
    await vi.waitFor(() => {
      expect(el.state.enhanced).toBe(true);
    });
    await el.updateComplete;
    expect(root?.querySelector('.mode strong')?.textContent).toBe('JavaScript on.');
  });

  it('checks a field as you type, and only that field', async () => {
    const { el, root, type } = await mount();
    type('email', 'ada@');
    await vi.waitFor(() => {
      expect(el.state.errors).toEqual({ email: ['Enter a valid email address.'] });
    });
    await el.updateComplete;
    expect(root?.querySelector('#email-error')?.textContent).toBe('Enter a valid email address.');
    type('email', 'ada@example.com');
    await vi.waitFor(() => {
      expect(el.state.errors).toEqual({});
    });
  });

  it('sends the form without a reload and adds the reply to the list', async () => {
    const { el, root, type, fetch } = await mount(() =>
      Response.json({ _tag: 'Redirected', location: '/?joined=Ada' }),
    );
    type('name', 'Ada');
    type('email', 'ada@example.com');
    root?.querySelector('form')?.requestSubmit();
    await vi.waitFor(() => {
      expect(el.state.joined).toBe('Ada');
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(el.state.attendees.map((a) => a.name)).toEqual(['Grace', 'Ada']);
    await el.updateComplete;
    // A fresh, empty form for the next reply.
    expect(root?.querySelector<HTMLInputElement>('[name=email]')?.value).toBe('');
  });
});
