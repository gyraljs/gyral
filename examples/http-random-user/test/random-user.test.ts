import { afterEach, describe, expect, it } from 'vitest';
import type { HttpError, HttpRequest } from '@gyral/http';
import { fakeDriver } from '@gyral/testing';
import { RandomUser } from '../src/random-user.js';
import { USER_COUNT, userUrl } from '../src/users.js';

const ada = {
  id: 3,
  name: 'Ada Lovelace',
  email: 'ada@example.org',
  website: 'ada.example.org',
  phone: '555-0100',
  company: { name: 'Analytical Engines' },
};

const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  // Requests wait until the test answers them. No network.
  const http = fakeDriver<HttpRequest, unknown, HttpError>('http');
  const el = new RandomUser();
  el.drivers = { http };
  document.body.append(el);
  await el.updateComplete;
  const button = el.shadowRoot?.querySelector('button');
  if (button == null) throw new Error('missing button');
  const settle = async () => {
    await tick();
    await el.updateComplete;
  };
  return { el, http, button, settle };
}

const text = (el: Element, sel: string) => el.shadowRoot?.querySelector(sel)?.textContent.trim();

afterEach(() => {
  document.body.replaceChildren();
});

describe('http-random-user', () => {
  it('clicking requests a random user in range and shows loading', async () => {
    const { el, http, button, settle } = await mount();
    button.click();
    await settle();
    expect(http.calls).toHaveLength(1);
    const id = Number(http.inputs[0]?.url.split('/').pop());
    expect(id).toBeGreaterThanOrEqual(1);
    expect(id).toBeLessThanOrEqual(USER_COUNT);
    expect(el.state._tag).toBe('Loading');
    expect(button.getAttribute('aria-busy')).toBe('true');
    // Model state is visible to CSS as a custom state, from inside and outside the component.
    expect(el.matches(':state(loading)')).toBe(true);
    expect(getComputedStyle(button).cursor).toBe('progress');
  });

  it('clears the loading state and sets failed on error', async () => {
    const { el, http, settle } = await mount();
    el.send({ _tag: 'GetRandom', id: 3 });
    await settle();
    http.rejectNext({ _tag: 'HttpNetworkError', url: userUrl(3), message: 'offline' });
    await settle();
    expect(el.matches(':state(loading)')).toBe(false);
    expect(el.matches(':state(failed)')).toBe(true);
  });

  it('renders the user card on success', async () => {
    const { el, http, settle } = await mount();
    el.send({ _tag: 'GetRandom', id: 3 });
    await settle();
    expect(http.inputs[0]?.url).toBe(userUrl(3));
    http.resolveNext(ada);
    await settle();
    expect(text(el, 'article h2')).toBe('Ada Lovelace');
    expect(el.shadowRoot?.querySelector('a[href^="mailto:"]')?.getAttribute('href')).toBe(
      'mailto:ada@example.org',
    );
  });

  it('shows a typed error on failure', async () => {
    const { el, http, settle } = await mount();
    el.send({ _tag: 'GetRandom', id: 3 });
    await settle();
    http.rejectNext({
      _tag: 'HttpStatusError',
      url: userUrl(3),
      status: 404,
      statusText: 'Not Found',
    });
    await settle();
    expect(text(el, '[role=alert]')).toBe('The server answered 404 Not Found.');
  });

  it('ignores clicks while a request is in flight (exhaust)', async () => {
    const { el, http, button, settle } = await mount();
    el.send({ _tag: 'GetRandom', id: 3 });
    button.click();
    button.click();
    await settle();
    expect(http.calls).toHaveLength(1);
    http.resolveNext(ada);
    await settle();
    expect(text(el, 'article h2')).toBe('Ada Lovelace');
    el.send({ _tag: 'GetRandom', id: 4 });
    await settle();
    expect(http.inputs.map((r) => r.url)).toEqual([userUrl(3), userUrl(4)]);
  });
});
