// Server rendering for Gyral (docs/design-docs/0012-ssr.md, view/06-server.md). Runtime-agnostic:
// returns web `Response`/`ReadableStream`, so Hono, Deno, Bun or a Service Worker can serve it.
// Rendering is `@gyral/core/server`'s; this package adds the page shell, streaming with the
// request's store scope (ADR 0013), static generation and form actions.
import { StoreRegistry, withStoreScope, type ChildValue } from '@gyral/core';
import { render, renderToString as renderString } from '@gyral/core/server';
import { page, type PageOptions, type RenderOptions } from './page.js';

export { page, type PageOptions, type RenderOptions } from './page.js';
export { contentSecurityPolicy, type CspDirectives, type CspOptions } from './csp.js';
export { formAction, rejectWith, seeOther } from './forms.js';
export type { FormActionHandlers, FormReject } from './forms.js';

const coreOptions = (options: RenderOptions) =>
  options.dev === undefined ? {} : { dev: options.dev };

/**
 * Renders to a complete string (tests, caching, static generation), with this request's stores
 * in scope (ADR 0013).
 */
export function renderToString(value: ChildValue, options: RenderOptions = {}): Promise<string> {
  const registry = new StoreRegistry(options.stores ?? []);
  return new Promise((resolve) => {
    resolve(withStoreScope(registry, () => renderString(value, coreOptions(options))));
  });
}

/**
 * Renders to a byte stream, so the first bytes leave before the whole page is ready. Each pull
 * renders up to the next component boundary inside this request's store scope, so interleaved
 * requests never see each other's stores (ADR 0013), on any runtime.
 */
export function renderToStream(
  value: ChildValue,
  options: RenderOptions = {},
): ReadableStream<Uint8Array> {
  const registry = new StoreRegistry(options.stores ?? []);
  const encoder = new TextEncoder();
  let chunks: Iterator<string> | undefined;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const step = withStoreScope(registry, () => {
        chunks ??= render(value, coreOptions(options))[Symbol.iterator]();
        return chunks.next();
      });
      if (step.done === true) controller.close();
      else controller.enqueue(encoder.encode(step.value));
    },
    cancel() {
      chunks?.return?.();
    },
  });
}

/** A streaming HTML `Response` for a full page. */
export function renderPage(options: PageOptions, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
  if (options.csp !== undefined && !headers.has('content-security-policy')) {
    headers.set('content-security-policy', options.csp);
  }
  return new Response(renderToStream(page(options), options), { ...init, headers });
}
