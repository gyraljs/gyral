import { retry, type Driver } from '@gyral/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  makeWebSocketDriver,
  type WebSocketPayload,
  type WebSocketInput,
  type WebSocketOutput,
  type WebSocketError,
} from '../../src/websocket.js';

const instances: WebSocket[] = [];
const removed: string[] = [];
const queued: (string | number)[] = [];
let closed = 0;
const Native = WebSocket;
class Tracked extends Native {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    instances.push(this);
  }
  override close(code?: number, reason?: string): void {
    closed += 1;
    super.close(code, reason);
  }
  override send(payload: WebSocketPayload): void {
    super.send(payload);
    queued.push(
      typeof payload === 'string'
        ? payload
        : payload instanceof Blob
          ? payload.size
          : payload.byteLength,
    );
  }
}
Object.defineProperty(Tracked.prototype, 'removeEventListener', {
  value: function (
    this: WebSocket,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void {
    removed.push(type);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply supplies the native receiver
    Reflect.apply(EventTarget.prototype.removeEventListener, this, [type, listener, options]);
  },
});
globalThis.WebSocket = Tracked;

type Output = WebSocketOutput<number>;
type Result = Output | WebSocketError | undefined;
interface Options {
  readonly limit?: number;
  readonly retryDelay?: number;
  readonly binary?: boolean;
  readonly delayed?: boolean;
  readonly encodeThrows?: boolean;
  readonly protocols?: readonly string[];
}
interface Api {
  readonly values: Output[];
  readonly instances: WebSocket[];
  readonly removed: string[];
  readonly queued: (string | number)[];
  readonly closed: number;
  readonly pending: boolean;
  start(url: string, options?: Options): void;
  run(input: WebSocketInput<WebSocketPayload>): Promise<Result>;
  release(value: number): void;
  abort(): Promise<Result>;
  done(): Promise<Result>;
}
declare global {
  interface Window {
    wsTest: Api;
  }
}
const values: Output[] = [];
const pending = new Map<number, (result: StandardSchemaV1.Result<number>) => void>();
let controller = new AbortController();
let driver: Driver<WebSocketInput<WebSocketPayload>, Output, WebSocketError> | undefined;
let done: Promise<Result> = Promise.resolve(undefined);
window.wsTest = {
  values,
  instances,
  removed,
  queued,
  get closed() {
    return closed;
  },
  get pending() {
    return pending.size > 0;
  },
  start: (url, options = {}) => {
    controller = new AbortController();
    const schema: StandardSchemaV1<unknown, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => {
          if (typeof value !== 'number') return { issues: [{ message: 'Number required.' }] };
          if (options.delayed && value === 1)
            return new Promise((resolve) => {
              pending.set(value, resolve);
            });
          return { value };
        },
      },
    };
    const native = makeWebSocketDriver<number, WebSocketPayload>(schema, {
      encode: (value) => {
        if (options.encodeThrows) throw new Error('Encoder rejected.');
        return value;
      },
      ...(options.limit === undefined ? {} : { maxBufferedBytes: options.limit }),
      ...(options.binary === true
        ? {
            parse: (payload: string | ArrayBuffer) =>
              typeof payload === 'string'
                ? (JSON.parse(payload) as unknown)
                : new Uint8Array(payload)[0],
          }
        : {}),
    });
    driver =
      options.retryDelay === undefined
        ? native
        : retry(native, {
            times: 2,
            delayMs: options.retryDelay,
            backoff: 'exponential',
            retryIf: (error) => error._tag === 'WebSocketClosedError' && error.code !== 1000,
          });
    const current = driver;
    done = Promise.resolve(
      current.run(
        {
          _tag: 'Connect',
          connection: 'live',
          url,
          ...(options.protocols === undefined ? {} : { protocols: options.protocols }),
        },
        {
          signal: controller.signal,
          emit: (value) => {
            values.push(value);
          },
        },
      ),
    )
      .then((value) => {
        values.push(value);
        return value;
      })
      .catch((cause: unknown) => current.toError?.(cause));
  },
  run: async (input) => {
    const current = driver;
    if (current === undefined) throw new Error('Start before running socket commands.');
    try {
      return await current.run(input, {
        signal: new AbortController().signal,
        emit: (value) => {
          values.push(value);
        },
      });
    } catch (cause) {
      return current.toError?.(cause);
    }
  },
  release: (value) => {
    pending.get(value)?.({ value });
    pending.delete(value);
  },
  abort: () => {
    controller.abort();
    return done;
  },
  done: () => done,
};
