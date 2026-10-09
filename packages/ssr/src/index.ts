// Server rendering for Gyral (docs/design-docs/0012-ssr.md, view/06-server.md). Runtime-agnostic:
// returns web `Response`/`ReadableStream`, so Hono, Deno, Bun or a Service Worker can serve it.
// Rendering is `@gyral/core/server`'s; this package adds the page shell, chunked output with
// the request's store scope (ADR 0013), static generation and form actions.
import { type ChildValue } from '@gyral/core';
import { StoreRegistry, withStoreScope } from '@gyral/core/server';
import {
  development,
  render,
  renderToString as renderString,
  type StyleValues,
} from '@gyral/core/server';
import { checkPolicy, policyAtRender, policyWithAttributes } from './csp.js';
import { page, type PageOptions, type RenderOptions } from './page.js';

export { page, type PageOptions, type RenderOptions } from './page.js';
export { contentSecurityPolicy, type CspDirectives, type CspOptions } from './csp.js';
export { formAction, rejectWith, seeOther } from './forms.js';
export type { FormActionHandlers, FormReject } from './forms.js';

const rethrow = (error: unknown): never => {
  throw error;
};

/** Core's render options: `dev`, and `onError` with `'throw'` as a rethrow (ADR 0024). */
const coreOptions = ({ dev, onError }: RenderOptions) => ({
  ...(dev === undefined ? {} : { dev }),
  ...(onError === undefined
    ? {}
    : { onError: onError === 'throw' ? rethrow : (onError as (error: unknown) => void) }),
});

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

/**
 * An HTML `Response` for a full page, its body pulled in chunks from a synchronous render (one
 * component boundary per pull; `renderToStream`): load data first, since nothing is awaited
 * and there is no async or suspense streaming. Status and headers are final before the first
 * byte. `csp` sets the `Content-Security-Policy`
 * header: a string as is, or `contentSecurityPolicy()`'s options to build it now, with every
 * component registered by the time the page renders (and the page's `styles`). With
 * `csp: { styleAttributes: 'hash' }` the page is rendered to a string first, so the header can
 * list its `style` attribute values by hash (ADR 0020); a render error then throws here.
 * A component whose `init` or view throws renders its error view and the page goes on;
 * `onError` hears it, and `onError: 'throw'` renders to a string first and throws here instead,
 * before any byte is sent (ADR 0024).
 */
export function renderPage(options: PageOptions, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
  const { csp } = options;
  const hashing =
    typeof csp === 'object' &&
    csp.styleAttributes === 'hash' &&
    !headers.has('content-security-policy');
  if (hashing || options.onError === 'throw') {
    // Rendered to a string first: the CSP lists the page's style attribute hashes (ADR 0020),
    // or a component's failure throws from here before any byte is sent (ADR 0024).
    const values: StyleValues | undefined = hashing ? new Map() : undefined;
    const registry = new StoreRegistry(options.stores ?? []);
    const dev = options.dev ?? development;
    const body = withStoreScope(registry, () =>
      renderString(page(options), {
        ...coreOptions(options),
        dev,
        ...(values === undefined ? {} : { styleAttributes: values }),
      }),
    );
    if (values !== undefined && typeof csp === 'object') {
      headers.set(
        'content-security-policy',
        policyWithAttributes(csp, options.styles, values, dev),
      );
    } else if (csp !== undefined && !headers.has('content-security-policy')) {
      if (typeof csp === 'string' && dev) checkPolicy(csp);
      headers.set(
        'content-security-policy',
        typeof csp === 'string' ? csp : policyAtRender(csp, options.styles),
      );
    }
    return new Response(body, { ...init, headers });
  }
  if (csp !== undefined && !headers.has('content-security-policy')) {
    const header = typeof csp === 'string' ? csp : policyAtRender(csp, options.styles);
    if (typeof csp === 'string' && (options.dev ?? development)) checkPolicy(csp);
    headers.set('content-security-policy', header);
  }
  return new Response(renderToStream(page(options), options), { ...init, headers });
}
