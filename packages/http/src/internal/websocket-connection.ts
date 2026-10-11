import type { DriverContext } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type {
  WebSocketError,
  WebSocketIncoming,
  WebSocketInput,
  WebSocketOutput,
} from '../websocket-types.js';

export class SocketFailure extends Error {
  constructor(readonly error: WebSocketError) {
    super(error._tag);
  }
}
class DecodeFailure extends Error {
  constructor(readonly issues: readonly StandardSchemaV1.Issue[]) {
    super('Invalid WebSocket message.');
  }
}
export const messageOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);
export interface SocketOwner<T> {
  readonly socket: WebSocket;
  readonly emit: (output: WebSocketOutput<T>) => void;
  closing: boolean;
}

/** Normal/intentional close resolves; other native closes reject after retaining metadata. */
export function connectSocket<T>(
  connections: Map<string, SocketOwner<T>>,
  input: Extract<WebSocketInput<unknown>, { _tag: 'Connect' }>,
  schema: StandardSchemaV1<unknown, T>,
  parse: (payload: WebSocketIncoming) => unknown,
  ctx: DriverContext<WebSocketOutput<T>>,
): Promise<WebSocketOutput<T>> {
  return new Promise((resolve, reject) => {
    ctx.signal.throwIfAborted();
    let socket: WebSocket;
    try {
      if (connections.has(input.connection)) throw new Error('Connection ID is already owned.');
      if (typeof WebSocket === 'undefined') throw new Error('WebSocket is unavailable.');
      socket =
        input.protocols === undefined
          ? new WebSocket(input.url)
          : new WebSocket(
              input.url,
              typeof input.protocols === 'string' ? input.protocols : [...input.protocols],
            );
      socket.binaryType = 'arraybuffer';
    } catch (cause) {
      reject(
        new SocketFailure({
          _tag: 'WebSocketConnectError',
          connection: input.connection,
          url: input.url,
          message: messageOf(cause),
        }),
      );
      return;
    }
    const owner: SocketOwner<T> = { socket, emit: ctx.emit, closing: false };
    const lifetime = { live: true, errored: false };
    const active = (): boolean => lifetime.live && !ctx.signal.aborted;
    const state = (value: 'connecting' | 'open'): void => {
      ctx.emit({
        _tag: 'WebSocketState',
        connection: input.connection,
        url: socket.url,
        state: value,
      });
    };
    const cleanup = (): void => {
      lifetime.live = false;
      ctx.signal.removeEventListener('abort', abort);
      socket.removeEventListener('open', open);
      socket.removeEventListener('message', message);
      socket.removeEventListener('error', error);
      socket.removeEventListener('close', close);
      if (connections.get(input.connection) === owner) connections.delete(input.connection);
      if (socket.readyState !== socket.CLOSED) socket.close(1000);
    };
    const end = (cause: unknown): void => {
      if (!lifetime.live) return;
      cleanup();
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- preserve AbortSignal reasons
      reject(cause);
    };
    const abort = (): void => {
      end(ctx.signal.reason);
    };
    const open = (): void => {
      if (active()) state('open');
    };
    const error = (): void => {
      lifetime.errored = true;
    };
    let chain = Promise.resolve();
    const message = (event: MessageEvent<unknown>): void => {
      const raw = event.data;
      chain = chain.then(async () => {
        if (!active()) return;
        try {
          if (typeof raw !== 'string' && !(raw instanceof ArrayBuffer))
            throw new Error('Expected text or ArrayBuffer data.');
          const result = await schema['~standard'].validate(parse(raw));
          if (result.issues !== undefined) throw new DecodeFailure(result.issues);
          if (active())
            ctx.emit({
              _tag: 'WebSocketMessage',
              connection: input.connection,
              data: result.value,
            });
        } catch (cause) {
          if (active())
            ctx.emit({
              _tag: 'WebSocketDecodeFailed',
              connection: input.connection,
              issues:
                cause instanceof DecodeFailure ? cause.issues : [{ message: messageOf(cause) }],
            });
        }
      });
    };
    const close = (event: CloseEvent): void => {
      if (!active()) return;
      const result = {
        _tag: 'WebSocketClosed',
        connection: input.connection,
        url: socket.url,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        requested: owner.closing,
      } as const;
      if (owner.closing || (event.wasClean && event.code === 1000)) {
        cleanup();
        resolve(result);
      } else {
        ctx.emit(result);
        end(
          new SocketFailure({ ...result, _tag: 'WebSocketClosedError', errored: lifetime.errored }),
        );
      }
    };
    connections.set(input.connection, owner);
    socket.addEventListener('open', open);
    socket.addEventListener('message', message);
    socket.addEventListener('error', error);
    socket.addEventListener('close', close);
    ctx.signal.addEventListener('abort', abort, { once: true });
    if (ctx.signal.aborted) abort();
    else state('connecting');
  });
}
