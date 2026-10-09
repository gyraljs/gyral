import { describe, expect, it } from 'vitest';
import type { DevEvent } from '@gyral/core';
import { initialPanel, MAX_ROWS, preview, receive, visibleRows } from '../src/model.js';

const el = {} as Element;
const comp = (id: number) => ({ tag: 'x-card', id, element: el });
const at = 1;

describe('panel model (ADR 0017)', () => {
  it('turns events into rows, live components and command lanes', () => {
    const events: DevEvent[] = [
      { kind: 'connect', component: comp(1), at },
      {
        kind: 'update',
        component: comp(1),
        msg: { _tag: 'Add' },
        prev: { n: 0 },
        next: { n: 1 },
        at,
      },
      {
        kind: 'command',
        owner: '<x-card>#1',
        phase: 'issued',
        driver: 'http',
        lane: 'http',
        policy: 'switch',
        input: 1,
        at,
      },
      {
        kind: 'command',
        owner: '<x-card>#1',
        phase: 'issued',
        driver: 'http',
        lane: 'http',
        policy: 'switch',
        input: 2,
        at,
      },
      {
        kind: 'command',
        owner: '<x-card>#1',
        phase: 'interrupted',
        driver: 'http',
        lane: 'http',
        policy: 'switch',
        input: 1,
        at,
      },
      { kind: 'store', store: 'cart', msg: { _tag: 'Inc' }, prev: 0, next: 1, at },
    ];
    const s = receive(initialPanel(), events);
    expect(s.rows.map((r) => `${r.kind}:${r.who}:${r.what}`)).toEqual([
      'component:<x-card>#1:connect',
      'update:<x-card>#1:Add',
      'command:<x-card>#1:issued http',
      'command:<x-card>#1:issued http',
      'command:<x-card>#1:interrupted http',
      'store:store:cart:Inc',
    ]);
    expect(s.components.map((c) => c.id)).toEqual([1]);
    expect(s.lanes).toEqual([
      expect.objectContaining({
        owner: '<x-card>#1',
        lane: 'http',
        policy: 'switch',
        last: 'interrupted',
        inFlight: 1,
      }),
    ]);
    const gone = receive(s, [{ kind: 'disconnect', component: comp(1), at }]);
    expect(gone.components).toEqual([]);
  });

  it('filters by text and kind, newest first', () => {
    const s = receive(initialPanel(), [
      { kind: 'update', component: comp(1), msg: { _tag: 'Add' }, prev: 0, next: 1, at },
      { kind: 'update', component: comp(1), msg: { _tag: 'Remove' }, prev: 1, next: 0, at },
      { kind: 'store', store: 'cart', msg: { _tag: 'Add' }, prev: 0, next: 1, at },
    ]);
    expect(visibleRows({ ...s, filter: 'add' }).map((r) => r.who)).toEqual([
      'store:cart',
      '<x-card>#1',
    ]);
    expect(visibleRows({ ...s, kinds: ['store'] })).toHaveLength(1);
  });

  it('shows failures as error rows (ADR 0024)', () => {
    const s = receive(initialPanel(), [
      {
        kind: 'error',
        component: comp(1),
        phase: 'update',
        msg: 'Add',
        message: '<x-card> update for "Add" failed',
        error: new Error('boom'),
        at,
      },
      { kind: 'error', phase: 'store', message: 'store failed', error: 'x', at },
    ]);
    expect(s.rows.map((r) => `${r.kind}:${r.who}:${r.what}:${r.detail}`)).toEqual([
      'error:<x-card>#1:update failed (Add):Error: boom',
      'error:gyral:store failed:"x"',
    ]);
  });

  it('keeps at most MAX_ROWS rows', () => {
    const many: DevEvent[] = Array.from({ length: MAX_ROWS + 10 }, (_, i) => ({
      kind: 'store',
      store: 's',
      msg: { _tag: 'T' },
      prev: i,
      next: i + 1,
      at,
    }));
    const s = receive(initialPanel(), many);
    expect(s.rows).toHaveLength(MAX_ROWS);
    expect(s.rows[0]?.seq).toBe(11);
  });

  it('previews values safely: cycles, functions, long text', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic['self'] = cyclic;
    expect(preview(cyclic)).toBe('{"a":1,"self":"[circular]"}');
    expect(preview({ f: () => 1 })).toBe('{"f":"[function]"}');
    expect(preview('x'.repeat(500), 10)).toHaveLength(10);
    expect(preview(undefined)).toBe('undefined');
  });
});
