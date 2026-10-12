import { command, type Command } from '@gyral/core';
import { readBookings, saveBooking, watchBookings, writeKey } from './booking-service.js';
import type { Draft, Msg, State } from './booking-types.js';

export const initialBooking = (): State => ({
  viewer: 'member',
  generation: 0,
  revision: -1,
  rows: [],
  drafts: {},
  operation: 0,
  pending: undefined,
  notice: 'Waiting for an authorized snapshot',
});

export function subscriptions(s: State): readonly Command<Msg>[] {
  const commands: Command<Msg>[] = [
    command(watchBookings, s.viewer, {
      key: `bookings:watch:${String(s.generation)}`,
      onSuccess: (snapshot) => ({ _tag: 'Snapshot', generation: s.generation, snapshot }),
    }),
  ];
  const pending = s.pending;
  if (pending === undefined) return commands;
  const match = { generation: s.generation, operation: pending.operation };
  if (pending.phase === 'key')
    commands.push(
      command(writeKey, undefined, {
        key: 'bookings:key',
        onSuccess: (key) => ({ _tag: 'Key', ...match, key }),
      }),
    );
  if (pending.phase === 'write')
    commands.push(
      command(
        saveBooking,
        {
          write: {
            viewer: pending.viewer,
            id: pending.id,
            quantity: pending.quantity,
            baseVersion: pending.baseVersion,
            key: pending.key,
          },
          attempt: pending.attempt,
        },
        {
          key: 'bookings:write',
          concurrency: 'switch',
          onSuccess: ({ revision }) => ({ _tag: 'Committed', ...match, revision }),
          onFailure: (error) => ({ _tag: 'Failed', ...match, reload: false, error }),
        },
      ),
    );
  if (pending.phase === 'committed')
    commands.push(
      command(readBookings, s.viewer, {
        key: `bookings:reload:${String(pending.attempt)}`,
        concurrency: 'switch',
        onSuccess: (snapshot) => ({ _tag: 'Snapshot', generation: s.generation, snapshot }),
        onFailure: (error) => ({ _tag: 'Failed', ...match, reload: true, error }),
      }),
    );
  return commands;
}

function matches(
  s: State,
  m: { readonly generation: number; readonly operation: number },
): boolean {
  return s.generation === m.generation && s.pending?.operation === m.operation;
}
export function reduce(s: State, m: Msg): State {
  switch (m._tag) {
    case 'Viewer':
      return m.viewer === s.viewer
        ? s
        : {
            ...initialBooking(),
            viewer: m.viewer,
            generation: s.generation + 1,
            operation: s.operation,
          };
    case 'Snapshot': {
      if (m.generation !== s.generation || m.snapshot.revision < s.revision) return s;
      const drafts: Record<string, Draft> = {};
      for (const row of m.snapshot.rows) {
        const draft = s.drafts[row.id];
        if (draft !== undefined) drafts[row.id] = draft;
      }
      const pending = s.pending;
      const complete = pending?.revision !== undefined && m.snapshot.revision >= pending.revision;
      const clearSubmitted =
        complete &&
        drafts[pending.id]?.quantity === pending.quantity &&
        drafts[pending.id]?.baseVersion === pending.baseVersion;
      return {
        ...s,
        revision: m.snapshot.revision,
        rows: m.snapshot.rows,
        drafts: clearSubmitted
          ? Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== pending.id))
          : drafts,
        pending: complete ? { ...pending, phase: 'done' } : pending,
        notice: complete
          ? 'Write committed and snapshot refreshed'
          : s.revision < 0
            ? 'Authorized snapshot ready'
            : s.notice,
      };
    }
    case 'Draft': {
      const row = s.rows.find((item) => item.id === m.id);
      if (row === undefined) return s;
      const draft = s.drafts[m.id] ?? {
        quantity: row.quantity,
        confirmed: false,
        baseVersion: row.version,
      };
      return {
        ...s,
        drafts: {
          ...s.drafts,
          [m.id]: {
            ...draft,
            ...('quantity' in m ? { quantity: m.quantity } : {}),
            ...('confirmed' in m ? { confirmed: m.confirmed } : {}),
          },
        },
      };
    }
    case 'Save': {
      const row = s.rows.find((item) => item.id === m.id);
      if (
        row === undefined ||
        !m.confirmed ||
        !Number.isInteger(m.quantity) ||
        m.quantity < 1 ||
        m.quantity > 8 ||
        (s.pending !== undefined && s.pending.phase !== 'done')
      )
        return s;
      const draft = s.drafts[m.id] ?? {
        quantity: m.quantity,
        confirmed: true,
        baseVersion: row.version,
      };
      const operation = s.operation + 1;
      return {
        ...s,
        operation,
        pending: {
          viewer: s.viewer,
          id: m.id,
          quantity: m.quantity,
          baseVersion: draft.baseVersion,
          key: '',
          operation,
          attempt: 0,
          phase: 'key',
          revision: undefined,
        },
        notice: 'Preparing a write',
      };
    }
    case 'Key':
      return matches(s, m) && s.pending?.phase === 'key'
        ? {
            ...s,
            pending: { ...s.pending, key: m.key, phase: 'write' },
            notice: 'Saving immutable draft',
          }
        : s;
    case 'Committed':
      return matches(s, m) && s.pending?.phase === 'write'
        ? {
            ...s,
            pending: { ...s.pending, revision: m.revision, phase: 'committed' },
            notice: 'Write committed; refreshing snapshot',
          }
        : s;
    case 'Failed':
      return matches(s, m) && s.pending?.phase === (m.reload ? 'committed' : 'write')
        ? {
            ...s,
            pending: { ...s.pending, phase: m.reload ? 'reload-failed' : 'failed' },
            notice: m.error,
          }
        : s;
    case 'Retry':
      return s.pending?.phase === 'failed' || s.pending?.phase === 'reload-failed'
        ? {
            ...s,
            pending: {
              ...s.pending,
              attempt: s.pending.attempt + 1,
              phase: s.pending.phase === 'failed' ? 'write' : 'committed',
            },
          }
        : s;
  }
}
