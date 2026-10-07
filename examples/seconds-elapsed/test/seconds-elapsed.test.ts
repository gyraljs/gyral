import { afterEach, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { virtualTime, type VirtualTime } from '@gyral/testing';
import { duration } from '../src/seconds-elapsed.js';

let clock: VirtualTime | undefined;

afterEach(() => {
  document.body.replaceChildren();
  clock?.restore();
  clock = undefined;
});

it('formats an ISO 8601 duration', () => {
  expect(duration(75)).toBe('PT75S');
});

it('counts seconds from zero (virtual time)', async () => {
  clock = virtualTime();
  const el = document.createElement('gy-seconds-elapsed');
  document.body.append(el);
  await settled();
  const text = () => el.shadowRoot?.querySelector('time')?.textContent;
  expect(text()).toBe('0');
  await clock.advance(3000);
  await settled();
  expect(text()).toBe('3');
  expect(el.shadowRoot?.querySelector('time')?.getAttribute('datetime')).toBe('PT3S');
});

it('stops ticking once removed', async () => {
  clock = virtualTime();
  const el = document.createElement('gy-seconds-elapsed');
  document.body.append(el);
  await settled();
  await clock.advance(2000);
  el.remove();
  await clock.advance(5000);
  expect(el.state.seconds).toBe(2);
});
