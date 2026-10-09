// Chunked rendering with the request's store scope (ADR 0013), shared by `renderToString` and
// `renderPage` (index.ts). Not exported from the package: `renderPage` is the streaming API.
import { type ChildValue } from '@gyral/core';
import { development, render, StoreRegistry, withStoreScope } from '@gyral/core/internal/server';
import { COMPONENTS_MARK, componentTail } from './components.js';
import type { RenderOptions } from './page.js';

const rethrow = (error: unknown): never => {
  throw error;
};

/** Core's render options: `dev`, and `onError` with `'throw'` as a rethrow (ADR 0024). */
export const coreOptions = ({ dev, onError }: RenderOptions) => ({
  ...(dev === undefined ? {} : { dev }),
  ...(onError === undefined
    ? {}
    : { onError: onError === 'throw' ? rethrow : (onError as (error: unknown) => void) }),
});

/**
 * With `components`: the set core fills with the rendered tags, and the function that puts
 * their tail in place of the page's mark (the mark comes after the body, so every tag is known
 * by then).
 */
export function componentsOf(options: RenderOptions) {
  const { components } = options;
  if (components === undefined) return undefined;
  const tags = new Set<string>();
  const dev = options.dev ?? development;
  return {
    tags,
    fill: (chunk: string): string =>
      chunk.includes(COMPONENTS_MARK)
        ? chunk.replace(COMPONENTS_MARK, () => componentTail(components, tags, dev))
        : chunk,
  };
}

/**
 * Renders to a byte stream, pulled one component boundary at a time: the render is synchronous
 * (load data before calling it; nothing is awaited and there is no suspense), and each pull
 * renders up to the next boundary inside this request's store scope, so interleaved requests
 * never see each other's stores (ADR 0013), on any runtime. A consumer that reads slowly
 * (backpressure) renders the page slowly too; one that cancels stops the render.
 */
export function renderToStream(
  value: ChildValue,
  options: RenderOptions = {},
): ReadableStream<Uint8Array> {
  const registry = new StoreRegistry(options.stores ?? []);
  const encoder = new TextEncoder();
  const loading = componentsOf(options);
  let chunks: Iterator<string> | undefined;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const step = withStoreScope(registry, () => {
        chunks ??= render(value, {
          ...coreOptions(options),
          ...(loading === undefined ? {} : { tags: loading.tags }),
        })[Symbol.iterator]();
        return chunks.next();
      });
      if (step.done === true) controller.close();
      else
        controller.enqueue(
          encoder.encode(loading === undefined ? step.value : loading.fill(step.value)),
        );
    },
    cancel() {
      chunks?.return?.();
    },
  });
}
