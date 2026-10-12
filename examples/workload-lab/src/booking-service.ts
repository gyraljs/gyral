import { defineDriver, subscription } from '@gyral/core';
import type { Snapshot, Viewer, Write } from './booking-types.js';

interface RecordRow {
  readonly id: string;
  readonly title: string;
  readonly quantity: number;
  readonly version: number;
  readonly private: boolean;
  readonly privateNote: string;
}
const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** An application-owned, in-memory stand-in for an authorized transactional backend. */
export class BookingService {
  private revision = 1;
  private rows: readonly RecordRow[] = [
    {
      id: 'morning',
      title: 'Morning class',
      quantity: 1,
      version: 1,
      private: false,
      privateNote: 'Member reservation',
    },
    {
      id: 'coaching',
      title: 'Member coaching',
      quantity: 2,
      version: 1,
      private: true,
      privateNote: 'Private coaching notes',
    },
  ];
  private readonly receipts = new Map<
    string,
    { readonly payload: string; readonly revision: number }
  >();
  private readonly listeners = new Set<() => void>();
  failWriteReply = false;
  failReload = false;
  get subscriberCount(): number {
    return this.listeners.size;
  }
  get committedWrites(): number {
    return this.receipts.size;
  }

  snapshot(viewer: Viewer): Snapshot {
    return {
      revision: this.revision,
      rows: this.rows
        .filter((row) => viewer === 'member' || !row.private)
        .map((row) => ({
          id: row.id,
          title: row.title,
          quantity: row.quantity,
          version: row.version,
          ...(viewer === 'member' ? { privateNote: row.privateNote } : {}),
        })),
    };
  }
  watch(viewer: Viewer, emit: (snapshot: Snapshot) => void): () => void {
    const listener = (): void => {
      emit(this.snapshot(viewer));
    };
    this.listeners.add(listener);
    listener();
    return () => {
      this.listeners.delete(listener);
    };
  }
  read(viewer: Viewer, signal: AbortSignal): Snapshot {
    signal.throwIfAborted();
    if (this.failReload) {
      this.failReload = false;
      throw new Error('Committed; reload unavailable');
    }
    return this.snapshot(viewer);
  }
  save(write: Write, signal: AbortSignal): { readonly revision: number } {
    signal.throwIfAborted();
    if (!write.key || !Number.isInteger(write.quantity) || write.quantity < 1 || write.quantity > 8)
      throw new Error('Invalid write');
    const row = this.rows.find((item) => item.id === write.id);
    if (row === undefined || (row.private && write.viewer !== 'member'))
      throw new Error('Not authorized');
    const identity = `${write.viewer}:${write.key}`;
    const payload = JSON.stringify(write);
    const prior = this.receipts.get(identity);
    if (prior !== undefined) {
      if (prior.payload !== payload) throw new Error('Retry key reused for a different write');
      return { revision: prior.revision };
    }
    if (row.version !== write.baseVersion)
      throw new Error('Revision conflict; review the current snapshot');
    this.revision += 1;
    this.rows = this.rows.map((item) =>
      item.id === row.id ? { ...item, quantity: write.quantity, version: item.version + 1 } : item,
    );
    const receipt = { payload, revision: this.revision };
    this.receipts.set(identity, receipt);
    for (const listener of this.listeners) listener();
    // A lost reply is deliberately ambiguous: the transaction already committed.
    if (this.failWriteReply) {
      this.failWriteReply = false;
      throw new Error('Write reply lost; retry the same key');
    }
    return { revision: receipt.revision };
  }
  revise(id: string, quantity: number, makePrivate = false): void {
    this.revision += 1;
    this.rows = this.rows.map((row) =>
      row.id === id ? { ...row, quantity, version: row.version + 1, private: makePrivate } : row,
    );
    for (const listener of this.listeners) listener();
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export const watchBookings = defineDriver<Viewer, Snapshot>('bookings:watch');
export const readBookings = defineDriver<Viewer, Snapshot, string>('bookings:read');
export const saveBooking = defineDriver<
  { readonly write: Write; readonly attempt: number },
  { readonly revision: number },
  string
>('bookings:save');
export const writeKey = defineDriver<undefined, string>({
  name: 'bookings:key',
  run: () => crypto.randomUUID(),
});

/** Implement this at the application boundary, including a shared managed runtime if used. */
export interface BookingRuntime {
  watch(viewer: Viewer, emit: (snapshot: Snapshot) => void): () => void;
  read(viewer: Viewer, signal: AbortSignal): Snapshot | Promise<Snapshot>;
  save(
    write: Write,
    signal: AbortSignal,
  ): { readonly revision: number } | Promise<{ readonly revision: number }>;
}
export function bookingDrivers(service: BookingRuntime) {
  return {
    'bookings:watch': subscription<Snapshot, Viewer>('bookings:watch', (emit, { input }) =>
      service.watch(input, emit),
    ),
    'bookings:read': defineDriver<Viewer, Snapshot, string>({
      name: 'bookings:read',
      toError: message,
      run: (viewer, { signal }) => service.read(viewer, signal),
    }),
    'bookings:save': defineDriver<
      { readonly write: Write; readonly attempt: number },
      { readonly revision: number },
      string
    >({
      name: 'bookings:save',
      toError: message,
      run: ({ write }, { signal }) => service.save(write, signal),
    }),
  };
}
