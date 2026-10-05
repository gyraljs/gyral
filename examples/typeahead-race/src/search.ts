// A simulated search server, so the race is reproducible: no network, and a fixed latency per
// query. Shorter queries are slower (they match more), which is exactly when a fast typist's
// early requests come back last.
import { command, defineDriver, type Command, type Concurrency } from '@gyral/core';

const CATALOG = [
  'AbortController',
  'AbortSignal',
  'Animation',
  'Blob',
  'BroadcastChannel',
  'Cache',
  'Canvas',
  'Clipboard',
  'CloseWatcher',
  'CompressionStream',
  'CustomElementRegistry',
  'CustomEvent',
  'DataTransfer',
  'Dialog',
  'Document',
  'DOMParser',
  'Element',
  'EventSource',
  'EventTarget',
  'Fetch',
  'File',
  'FileReader',
  'FileSystem',
  'FormData',
  'Geolocation',
  'Headers',
  'History',
  'IndexedDB',
  'IntersectionObserver',
  'Intl',
  'Invoker',
  'Location',
  'MediaQueryList',
  'MessageChannel',
  'MutationObserver',
  'Navigation',
  'Notification',
  'OffscreenCanvas',
  'Performance',
  'Popover',
  'PushManager',
  'ReadableStream',
  'Request',
  'ResizeObserver',
  'Response',
  'Screen',
  'Selection',
  'ServiceWorker',
  'ShadowRoot',
  'SharedWorker',
  'Storage',
  'StructuredClone',
  'SubtleCrypto',
  'Temporal',
  'TextDecoder',
  'TextEncoder',
  'TransformStream',
  'URL',
  'URLPattern',
  'URLSearchParams',
  'ViewTransition',
  'VisualViewport',
  'WakeLock',
  'WebAssembly',
  'WebSocket',
  'WebTransport',
  'Worker',
  'WritableStream',
  'XMLHttpRequest',
] as const;

export interface Results {
  readonly query: string;
  readonly items: readonly string[];
}

/** Matches by prefix first, then anywhere, case-insensitively; at most `limit` items. */
export function searchCatalog(query: string, limit = 6): readonly string[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const prefix = CATALOG.filter((name) => name.toLowerCase().startsWith(q));
  const inside = CATALOG.filter(
    (name) => !name.toLowerCase().startsWith(q) && name.toLowerCase().includes(q),
  );
  return [...prefix, ...inside].slice(0, limit);
}

/**
 * Milliseconds the simulated server takes: 800 for one letter, 500 for two, then 250. An
 * empty query answers at once (and, under `switch`, cancels whatever was in flight).
 */
export function latency(query: string): number {
  const n = query.trim().length;
  return n === 0 ? 0 : Math.max(250, 1100 - 300 * n);
}

const aborted = (): DOMException => new DOMException('Aborted', 'AbortError');

/** The simulated server as a driver: answers after `latency(query)`, or never if aborted. */
export const searchDriver = defineDriver<string, Results>({
  name: 'search',
  run: (query, { signal }) =>
    new Promise<Results>((resolve, reject) => {
      if (signal.aborted) {
        reject(aborted());
        return;
      }
      const timer = setTimeout(() => {
        resolve({ query, items: searchCatalog(query) });
      }, latency(query));
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(aborted());
        },
        { once: true },
      );
    }),
});

/** One search. The ONLY difference between the two panels is `concurrency`. */
export function search<M>(
  query: string,
  concurrency: Concurrency,
  onResults: (results: Results) => M,
): Command<M> {
  return command(searchDriver, query, { onSuccess: onResults, key: 'search', concurrency });
}
