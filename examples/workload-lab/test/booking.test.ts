import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { fakeDriver, inputsFor, mount, parse, step, subscriptionsFor } from '@gyral/testing';
import { Booking } from '../src/booking.js';
import { initialBooking, reduce, subscriptions } from '../src/booking-model.js';
import {
  BookingService,
  bookingDrivers,
  readBookings,
  saveBooking,
} from '../src/booking-service.js';
import type { State, Write } from '../src/booking-types.js';

afterEach(() => {
  document.querySelectorAll('gy-booking').forEach((el) => {
    el.remove();
  });
});
const snapshot = (s: State, service: BookingService): State =>
  reduce(s, { _tag: 'Snapshot', generation: s.generation, snapshot: service.snapshot(s.viewer) });
function prepared(service: BookingService): State {
  let s = snapshot(initialBooking(), service);
  s = reduce(s, { _tag: 'Draft', id: 'morning', quantity: 3, confirmed: true });
  s = reduce(s, { _tag: 'Save', id: 'morning', quantity: 3, confirmed: true });
  return reduce(s, { _tag: 'Key', generation: 0, operation: 1, key: 'same-key' });
}

describe('authoritative snapshots and drafts', () => {
  it('preserves stable-ID drafts, rejects stale reads and clears private state on viewer changes', () => {
    const service = new BookingService();
    const s = prepared(service);
    const old = service.snapshot('member');
    service.revise('morning', 7);
    const updated = snapshot(s, service);
    expect(updated.rows[0]?.quantity).toBe(7);
    expect(updated.drafts['morning']?.quantity).toBe(3);
    expect(updated.drafts['morning']?.baseVersion).toBe(1);
    expect(reduce(updated, { _tag: 'Snapshot', generation: 0, snapshot: old })).toBe(updated);
    const guest = reduce(updated, { _tag: 'Viewer', viewer: 'guest' });
    expect(guest.rows).toEqual([]);
    expect(guest.drafts).toEqual({});
    expect(guest.pending).toBeUndefined();
    expect(reduce(guest, { _tag: 'Snapshot', generation: 0, snapshot: old })).toBe(guest);
    const publicState = snapshot(guest, service);
    expect(publicState.rows).toHaveLength(1);
    expect(publicState.rows[0]).not.toHaveProperty('privateNote');
    service.revise('morning', 7, true);
    expect(snapshot(publicState, service).rows).toEqual([]);
  });

  it('reuses the immutable retry payload and does not repeat a committed write after reload failure', () => {
    const service = new BookingService();
    let s = prepared(service);
    const before = inputsFor(subscriptions(s), saveBooking)[0];
    s = reduce(s, {
      _tag: 'Failed',
      generation: 0,
      operation: 1,
      reload: false,
      error: 'Lost reply',
    });
    s = reduce(s, { _tag: 'Draft', id: 'morning', quantity: 4 });
    s = reduce(s, { _tag: 'Retry' });
    const retried = inputsFor(subscriptions(s), saveBooking)[0];
    expect(retried?.write).toEqual(before?.write);
    expect(retried?.attempt).toBe(1);
    s = reduce(s, { _tag: 'Committed', generation: 0, operation: 1, revision: 2 });
    s = reduce(s, {
      _tag: 'Failed',
      generation: 0,
      operation: 1,
      reload: true,
      error: 'Reload unavailable',
    });
    expect(s.pending?.phase).toBe('reload-failed');
    s = reduce(s, { _tag: 'Retry' });
    expect(inputsFor(subscriptions(s), saveBooking)).toEqual([]);
    expect(inputsFor(subscriptions(s), readBookings)).toEqual(['member']);
    service.revise('morning', 3);
    s = snapshot(s, service);
    expect(s.pending?.phase).toBe('done');
    expect(s.drafts['morning']?.quantity).toBe(4);
  });

  it('commits once when a reply is lost and rejects reuse of the key with different data', () => {
    const service = new BookingService();
    const signal = new AbortController().signal;
    const write: Write = {
      viewer: 'member',
      id: 'morning',
      quantity: 3,
      baseVersion: 1,
      key: 'retry-key',
    };
    service.failWriteReply = true;
    expect(() => service.save(write, signal)).toThrow('reply lost');
    expect(service.committedWrites).toBe(1);
    expect(service.save(write, signal)).toEqual({ revision: 2 });
    expect(service.committedWrites).toBe(1);
    expect(() => service.save({ ...write, quantity: 4 }, signal)).toThrow('different write');
    const cancelled = new AbortController();
    cancelled.abort();
    expect(() => service.save(write, cancelled.signal)).toThrow();
    expect(service.snapshot('member').rows[0]?.quantity).toBe(3);
    expect(() => service.save({ ...write, viewer: 'guest', id: 'coaching' }, signal)).toThrow(
      'authorized',
    );
  });

  it('parses multiple controls and native invalid submissions never start writes', async () => {
    const service = new BookingService();
    const writes = fakeDriver(saveBooking);
    const mounted = await mount(Booking, {
      drivers: { ...bookingDrivers(service), 'bookings:save': writes },
    });
    const form = mounted.$('form');
    const input = mounted.$('input[name="quantity"]');
    const checkbox = mounted.$('input[name="confirmed"]');
    if (
      !(form instanceof HTMLFormElement) ||
      !(input instanceof HTMLInputElement) ||
      !(checkbox instanceof HTMLInputElement)
    )
      throw new Error('Expected native controls');
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    form.requestSubmit();
    await settled();
    expect(checkbox.validity.valueMissing).toBe(true);
    expect(writes.inputs).toEqual([]);
    checkbox.click();
    await settled();
    input.value = '9';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    form.requestSubmit();
    await settled();
    expect(input.validity.rangeOverflow).toBe(true);
    expect(writes.inputs).toEqual([]);
    input.value = '3';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settled();
    const parsed = parse(Booking, 'Save', { formData: new FormData(form) });
    expect(parsed).toEqual({ _tag: 'Save', id: 'morning', quantity: 3, confirmed: true });
    form.requestSubmit();
    await settled();
    expect(writes.inputs[0]?.write).toMatchObject({
      id: 'morning',
      quantity: 3,
      baseVersion: 1,
      viewer: 'member',
    });
    expect(writes.inputs[0]?.write.key).not.toBe('');
    mounted.dispose();
    await settled();
    expect(writes.calls[0]?.signal.aborted).toBe(true);
    expect(service.subscriberCount).toBe(0);
    expect(service.snapshot('member').rows).toHaveLength(2);
  });

  it('tests subscription inputs and state outcomes without DOM casts', () => {
    const s = prepared(new BookingService());
    expect(inputsFor(subscriptionsFor(Booking.spec, s), saveBooking)[0]?.write.key).toBe(
      'same-key',
    );
    expect(
      step(Booking.spec, s, { _tag: 'Committed', generation: 9, operation: 1, revision: 2 }).state,
    ).toBe(s);
  });
});
