import type { StandardSchemaV1 } from '@standard-schema/spec';
import { makeEventSourceDriver, type EventSourceOutput } from '../../src/sse.js';

const instances: EventSource[] = [];
const removed: string[] = [];
let closed = 0;
const Native = EventSource;
class Tracked extends Native {
  constructor(url: string | URL, options?: EventSourceInit) {
    super(url, options); instances.push(this);
  }
  override close(): void { closed += 1; super.close(); }
}
Object.defineProperty(Tracked.prototype, 'removeEventListener', { value: function(this: EventSource, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
  removed.push(type);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Reflect.apply supplies the native receiver
  Reflect.apply(EventTarget.prototype.removeEventListener, this, [type, listener, options]);
} });
globalThis.EventSource = Tracked;

interface StartOptions { readonly delayed?: boolean; readonly plain?: boolean; readonly withCredentials?: boolean }
interface Api {
  readonly values: EventSourceOutput<number>[];
  readonly instances: EventSource[];
  readonly removed: string[];
  readonly closed: number;
  start(url: string, options?: StartOptions): void;
  release(value: number): void;
  abort(): Promise<unknown>;
  readonly pending: boolean;
}
declare global { interface Window { sseTest: Api } }
let controller = new AbortController();
let done: Promise<unknown> = Promise.resolve();
const pending = new Map<number, (result: StandardSchemaV1.Result<number>) => void>();
const values: EventSourceOutput<number>[] = [];
window.sseTest = {
  values, instances, removed,
  get closed() { return closed; },
  get pending() { return pending.size > 0; },
  start: (url, options = {}) => {
    controller = new AbortController();
    const schema: StandardSchemaV1<unknown, number> = { '~standard': {
      version: 1, vendor: 'test', validate: (value) => {
        if (typeof value !== 'number') return { issues: [{ message: 'Number required.' }] };
        if (options.delayed && value === 1) return new Promise(resolve => { pending.set(value, resolve); });
        return { value };
      },
    } };
    const driver = makeEventSourceDriver(schema, { events: ['notice', 'open', 'error', 'notice'],
      withCredentials: options.withCredentials ?? false,
      ...(options.plain === true ? { parse: (text: string) => Number(text) } : {}),
    });
    done = Promise.resolve(driver.run({ url }, { signal: controller.signal, emit: value => { values.push(value); } })).catch((cause: unknown) => driver.toError?.(cause));
  },
  release: value => { pending.get(value)?.({ value }); pending.delete(value); },
  abort: () => { controller.abort(); return done; },
};
