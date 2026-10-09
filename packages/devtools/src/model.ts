// Pure panel model (ADR 0017): turns DevEvents into timeline rows, live components and
// command lanes. No DOM access, so it is tested without a browser.
import type { DevComponentRef, DevEvent } from '@gyral/core';

export type RowKind = 'component' | 'update' | 'command' | 'store' | 'error';
export const ROW_KINDS: readonly RowKind[] = ['update', 'command', 'store', 'component', 'error'];

export interface Row {
  readonly seq: number;
  readonly at: number;
  readonly kind: RowKind;
  /** `<tag>#id`, `store:name` or a command owner. */
  readonly who: string;
  /** The message tag, command phase + driver, or lifecycle step. */
  readonly what: string;
  /** Extra detail: lane and policy, or a short JSON preview of the next state. */
  readonly detail: string;
}

export interface Lane {
  readonly key: string;
  readonly owner: string;
  readonly lane: string;
  readonly policy: string;
  readonly last: string;
  readonly inFlight: number;
}

export interface PanelState {
  readonly open: boolean;
  readonly filter: string;
  readonly kinds: readonly RowKind[];
  readonly rows: readonly Row[];
  readonly components: readonly DevComponentRef[];
  readonly lanes: readonly Lane[];
  readonly seq: number;
}

/** Rows kept in memory; older ones drop off the front. */
export const MAX_ROWS = 500;

export const initialPanel = (open = false): PanelState => ({
  open,
  filter: '',
  kinds: ROW_KINDS,
  rows: [],
  components: [],
  lanes: [],
  seq: 0,
});

export const componentLabel = (c: DevComponentRef): string => `<${c.tag}>#${String(c.id)}`;

/** A bounded, cycle-safe JSON preview for display. Never throws. */
export function preview(value: unknown, limit = 120): string {
  const seen = new WeakSet();
  let text: string;
  try {
    // Typed as string, but JSON.stringify returns undefined for undefined and bare functions.
    const json = JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
        // Guarded: `Element` doesn't exist outside a browser (Node, workers).
        if (typeof Element !== 'undefined' && v instanceof Element) return `<${v.localName}>`;
      }
      if (typeof v === 'function') return '[function]';
      return v;
    }) as string | undefined;
    text = json ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function toRow(event: DevEvent, seq: number): Row {
  const base = { seq, at: event.at };
  switch (event.kind) {
    case 'connect':
    case 'disconnect':
      return {
        ...base,
        kind: 'component',
        who: componentLabel(event.component),
        what: event.kind,
        detail: '',
      };
    case 'hydrated':
      return {
        ...base,
        kind: 'component',
        who: componentLabel(event.component),
        what: event.serverRendered ? 'hydrated' : 'first render',
        detail: '',
      };
    case 'mismatch':
      return {
        ...base,
        kind: 'component',
        who: componentLabel(event.component),
        what: 'hydration mismatch',
        detail: event.message,
      };
    case 'update':
      return {
        ...base,
        kind: 'update',
        who: componentLabel(event.component),
        what: event.msg._tag,
        detail: preview(event.next),
      };
    case 'store':
      return {
        ...base,
        kind: 'store',
        who: `store:${event.store}`,
        what: event.msg._tag,
        detail: preview(event.next),
      };
    case 'command':
      return {
        ...base,
        kind: 'command',
        who: event.owner,
        what: `${event.phase} ${event.driver}`,
        detail: `lane ${event.lane}, ${event.policy}`,
      };
    case 'error':
      return {
        ...base,
        kind: 'error',
        who: event.component === undefined ? 'gyral' : componentLabel(event.component),
        what: `${event.phase} failed${event.msg === undefined ? '' : ` (${event.msg})`}`,
        detail: event.error instanceof Error ? String(event.error) : preview(event.error),
      };
  }
}

const IN_FLIGHT_DELTA: Readonly<Record<string, number>> = {
  issued: 1,
  settled: -1,
  failed: -1,
  interrupted: -1,
};

function updateLanes(lanes: readonly Lane[], event: DevEvent): readonly Lane[] {
  if (event.kind !== 'command') return lanes;
  const key = `${event.owner} ${event.lane}`;
  const current = lanes.find((l) => l.key === key);
  const inFlight = Math.max(0, (current?.inFlight ?? 0) + (IN_FLIGHT_DELTA[event.phase] ?? 0));
  const lane: Lane = {
    key,
    owner: event.owner,
    lane: event.lane,
    policy: event.policy,
    last: event.phase,
    inFlight,
  };
  return current === undefined ? [...lanes, lane] : lanes.map((l) => (l.key === key ? lane : l));
}

function updateComponents(
  list: readonly DevComponentRef[],
  event: DevEvent,
): readonly DevComponentRef[] {
  if (event.kind === 'connect') {
    return list.some((c) => c.id === event.component.id) ? list : [...list, event.component];
  }
  if (event.kind === 'disconnect') return list.filter((c) => c.id !== event.component.id);
  return list;
}

/** Folds a batch of events into the panel state. */
export function receive(state: PanelState, events: readonly DevEvent[]): PanelState {
  let { seq, lanes, components } = state;
  const rows: Row[] = [...state.rows];
  for (const event of events) {
    seq += 1;
    rows.push(toRow(event, seq));
    lanes = updateLanes(lanes, event);
    components = updateComponents(components, event);
  }
  return { ...state, seq, lanes, components, rows: rows.slice(-MAX_ROWS) };
}

/** Rows shown for the current filter text and kinds, newest first. */
export function visibleRows(state: PanelState): readonly Row[] {
  const needle = state.filter.trim().toLowerCase();
  return state.rows
    .filter((r) => state.kinds.includes(r.kind))
    .filter((r) => needle === '' || `${r.who} ${r.what} ${r.detail}`.toLowerCase().includes(needle))
    .reverse();
}
