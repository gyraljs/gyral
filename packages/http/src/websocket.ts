// Explicitly owned native sockets; no offline queue or automatic reconnect (ADR 0029).
import './core.js';
import type { Driver } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type {
  WebSocketError,
  WebSocketInput,
  WebSocketOptions,
  WebSocketOutput,
  WebSocketPayload,
} from './websocket-types.js';
import {
  connectSocket,
  messageOf,
  SocketFailure,
  type SocketOwner,
} from './internal/websocket-connection.js';
export type {
  WebSocketClosed,
  WebSocketError,
  WebSocketIncoming,
  WebSocketInput,
  WebSocketOptions,
  WebSocketOutput,
  WebSocketPayload,
} from './websocket-types.js';

const payloadBytes = (payload: WebSocketPayload): number => {
  if (typeof payload === 'string') return new TextEncoder().encode(payload).byteLength;
  if (payload instanceof Blob) return payload.size;
  if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) return payload.byteLength;
  throw new TypeError('Encoder must return native WebSocket data.');
};

/** Typed receive/send/close commands on one owned socket, with bounded outgoing buffering. */
export function makeWebSocketDriver<T, Out>(
  schema: StandardSchemaV1<unknown, T>,
  options: WebSocketOptions<Out>,
): Driver<WebSocketInput<Out>, WebSocketOutput<T>, WebSocketError> {
  const limit = options.maxBufferedBytes ?? 65536;
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new RangeError('maxBufferedBytes must be a nonnegative safe integer.');
  const connections = new Map<string, SocketOwner<T>>();
  const parse =
    options.parse ??
    ((payload) => {
      if (typeof payload !== 'string')
        throw new TypeError('Default WebSocket parser expects JSON text.');
      const value: unknown = JSON.parse(payload);
      return value;
    });
  const notOpen = (connection: string): SocketFailure =>
    new SocketFailure({
      _tag: 'WebSocketSendError',
      connection,
      reason: 'not-open',
      message: 'No owned OPEN connection.',
    });
  // Encoding runs at the effect boundary; re-read native state after the codec returns.
  const isOpen = (owner: SocketOwner<T>): boolean => owner.socket.readyState === owner.socket.OPEN;
  return {
    name: options.name ?? 'websocket',
    concurrency: 'merge',
    toError: (cause) =>
      cause instanceof SocketFailure
        ? cause.error
        : {
            _tag: 'WebSocketConnectError',
            connection: undefined,
            url: undefined,
            message: messageOf(cause),
          },
    run: async (input, ctx) => {
      ctx.signal.throwIfAborted();
      if (input._tag === 'Connect')
        return await connectSocket(connections, input, schema, parse, ctx);
      const owner = connections.get(input.connection);
      if (input._tag === 'Close') {
        try {
          if (owner === undefined) throw new Error('No owned connection.');
          owner.socket.close(input.code ?? 1000, input.reason);
          owner.closing = true;
          owner.emit({
            _tag: 'WebSocketState',
            connection: input.connection,
            url: owner.socket.url,
            state: 'closing',
          });
          return { _tag: 'WebSocketCloseRequested', connection: input.connection };
        } catch (cause) {
          throw new SocketFailure({
            _tag: 'WebSocketCloseError',
            connection: input.connection,
            message: messageOf(cause),
          });
        }
      }
      if (owner === undefined || !isOpen(owner)) throw notOpen(input.connection);
      let payload: WebSocketPayload;
      let bytes: number;
      try {
        payload = options.encode(input.value);
        bytes = payloadBytes(payload);
      } catch (cause) {
        throw new SocketFailure({
          _tag: 'WebSocketSendError',
          connection: input.connection,
          reason: 'encode',
          message: messageOf(cause),
        });
      }
      ctx.signal.throwIfAborted();
      if (connections.get(input.connection) !== owner || !isOpen(owner))
        throw notOpen(input.connection);
      const bufferedBytes = owner.socket.bufferedAmount;
      if (bufferedBytes + bytes > limit)
        throw new SocketFailure({
          _tag: 'WebSocketSendError',
          connection: input.connection,
          reason: 'buffer-limit',
          message: 'Outgoing buffer limit exceeded.',
          bufferedBytes,
          bytes,
          limit,
        });
      try {
        owner.socket.send(payload);
      } catch (cause) {
        throw new SocketFailure({
          _tag: 'WebSocketSendError',
          connection: input.connection,
          reason: 'send',
          message: messageOf(cause),
        });
      }
      return { _tag: 'WebSocketSent', connection: input.connection, bytes };
    },
  };
}
