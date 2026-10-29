// Native EventSource, with the browser's own reconnection and event IDs (ADR 0029).
import './core.js';
import { subscription, type Driver } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface EventSourceInput {
  readonly url: string;
}
export interface EventSourceError {
  readonly _tag: 'EventSourceError';
  readonly url: string | undefined;
  readonly message: string;
}
export type EventSourceOutput<T> =
  | {
      readonly _tag: 'EventSourceState';
      readonly url: string;
      readonly state: 'connecting' | 'open' | 'closed';
    }
  | {
      readonly _tag: 'EventSourceMessage';
      readonly url: string;
      readonly eventType: string;
      readonly lastEventId: string;
      readonly data: T;
    }
  | {
      readonly _tag: 'EventSourceDecodeFailed';
      readonly url: string;
      readonly eventType: string;
      readonly lastEventId: string;
      readonly issues: readonly StandardSchemaV1.Issue[];
    };
export interface EventSourceOptions {
  readonly name?: string;
  readonly withCredentials?: boolean;
  /** Named events in addition to the default message event. No wildcard native listener. */
  readonly events?: readonly string[];
  /** Default JSON parsing. Validation may be asynchronous. */
  readonly parse?: (text: string) => unknown;
}
class SourceFailure extends Error {
  constructor(readonly error: EventSourceError) {
    super(error.message);
  }
}
class DecodeFailure extends Error {
  constructor(readonly issues: readonly StandardSchemaV1.Issue[]) {
    super('Invalid SSE message.');
  }
}
const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** A cancellable feed; native EventSource owns reconnection, credentials and Last-Event-ID. */
export function makeEventSourceDriver<T>(
  schema: StandardSchemaV1<unknown, T>,
  options: EventSourceOptions = {},
): Driver<EventSourceInput, EventSourceOutput<T>, EventSourceError> {
  const types = [...new Set(['message', ...(options.events ?? [])])];
  const parse = options.parse ?? JSON.parse;
  return subscription<EventSourceOutput<T>, EventSourceInput, EventSourceError>(
    options.name ?? 'sse',
    (emit, { input, signal, fail }) => {
      let source: EventSource;
      try {
        if (typeof EventSource === 'undefined') throw new Error('EventSource is unavailable.');
        source = new EventSource(input.url, { withCredentials: options.withCredentials ?? false });
      } catch (cause) {
        throw new SourceFailure({
          _tag: 'EventSourceError',
          url: input.url,
          message: messageOf(cause),
        });
      }
      const lifetime = { live: true };
      const active = (): boolean => lifetime.live && !signal.aborted;
      const state = (value: 'connecting' | 'open' | 'closed'): void => {
        emit({ _tag: 'EventSourceState', url: source.url, state: value });
      };
      let chain = Promise.resolve();
      const message = (event: Event): void => {
        if (!(event instanceof MessageEvent)) return;
        const raw: unknown = event.data;
        const meta = { url: source.url, eventType: event.type, lastEventId: event.lastEventId };
        chain = chain.then(async () => {
          if (!active()) return;
          try {
            if (typeof raw !== 'string') throw new Error('EventSource data must be text.');
            const result = await schema['~standard'].validate(parse(raw));
            if (result.issues !== undefined) throw new DecodeFailure(result.issues);
            if (active()) emit({ _tag: 'EventSourceMessage', ...meta, data: result.value });
          } catch (cause) {
            if (active())
              emit({
                _tag: 'EventSourceDecodeFailed',
                ...meta,
                issues:
                  cause instanceof DecodeFailure ? cause.issues : [{ message: messageOf(cause) }],
              });
          }
        });
      };
      const open = (event: Event): void => {
        if (!(event instanceof MessageEvent) && active()) state('open');
      };
      const error = (event: Event): void => {
        if (event instanceof MessageEvent || !active()) return;
        if (source.readyState === EventSource.CLOSED) {
          state('closed');
          fail(
            new SourceFailure({
              _tag: 'EventSourceError',
              url: source.url,
              message: 'EventSource closed after a connection failure.',
            }),
          );
        } else state('connecting');
      };
      source.addEventListener('open', open);
      source.addEventListener('error', error);
      for (const type of types) source.addEventListener(type, message);
      state('connecting');
      return () => {
        lifetime.live = false;
        source.removeEventListener('open', open);
        source.removeEventListener('error', error);
        for (const type of types) source.removeEventListener(type, message);
        source.close();
      };
    },
    {
      toError: (cause) =>
        cause instanceof SourceFailure
          ? cause.error
          : { _tag: 'EventSourceError', url: undefined, message: messageOf(cause) },
    },
  );
}
