/// <reference types="node" />
// `@gyral/ssr/node` (gyral-dyn.6, ADR 0016 "Node adapter"): mounts a fetch handler,
// `(request) => Response`, on `node:http`, so a Node app needs neither Hono nor its own glue.
// Node-only, on its own subpath; everything behind it speaks web Request and Response.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/** A fetch handler: `productionServer(…).fetch`, a Hono app's `fetch`, or a plain function. */
export type FetchHandler = (request: Request) => Response | Promise<Response>;

export interface NodeListenerOptions {
  /**
   * The origin request URLs are built on, e.g. `https://example.com` behind a proxy. Default:
   * `http://` (`https://` on a TLS socket) plus the request's `Host` header, which the client
   * chooses: set it when the app writes absolute URLs (canonical links, redirects).
   */
  readonly origin?: string;
  /**
   * Called when the handler throws or the response body fails, before the 500 (or, once the
   * headers are out, before the connection is cut). Default: `console.error`.
   */
  readonly onError?: (error: unknown, request: Request) => void;
}

/** A Node `request` listener: `createServer(toNodeListener(app.fetch))`. */
export type NodeListener = (req: IncomingMessage, res: ServerResponse) => void;

function requestUrl(req: IncomingMessage, origin: string | undefined): URL {
  const base =
    origin ??
    `${'encrypted' in req.socket ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`;
  const target = req.url ?? '/';
  // Absolute-form (proxies) keeps only its path and query. Either is appended to the origin,
  // never resolved against it, so "//evil.example/x" stays a path.
  const path = target.startsWith('/')
    ? target
    : ((url) => `${url.pathname}${url.search}`)(new URL(target));
  return new URL(`${new URL(base).origin}${path}`);
}

function toRequest(req: IncomingMessage, url: URL, signal: AbortSignal): Request {
  const headers = new Headers();
  const raw = req.rawHeaders;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const name = raw[i] ?? '';
    if (!name.startsWith(':')) headers.append(name, raw[i + 1] ?? '');
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(req);
  return new Request(url, {
    method,
    headers,
    signal,
    ...(body === undefined
      ? {}
      : { body: body as ReadableStream<Uint8Array>, duplex: 'half' as const }),
  });
}

function writeHead(res: ServerResponse, response: Response): void {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== 'set-cookie') headers[name] = value;
  });
  // Joined with ", " a cookie list is unreadable (dates contain commas): one header each.
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers['set-cookie'] = cookies;
  if (response.statusText === '') res.writeHead(response.status, headers);
  else res.writeHead(response.status, response.statusText, headers);
}

/** Resolves when `res` can take more data, or the client has gone. */
const drained = (res: ServerResponse, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      signal.removeEventListener('abort', done);
      resolve();
    };
    res.on('drain', done);
    signal.addEventListener('abort', done);
  });

/**
 * Writes the body one chunk per read, waiting for `drain` when Node's buffer is full, so the
 * stream is pulled only as fast as the client takes it. A client that leaves cancels the
 * stream (a pending read ends); a stream that fails rejects, for the caller to report.
 */
async function send(
  res: ServerResponse,
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const cancel = (): void => void reader.cancel().catch(() => undefined);
  signal.addEventListener('abort', cancel);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) break;
      if (!res.write(value)) await drained(res, signal);
    }
    res.end();
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

const fail = (res: ServerResponse, status: number, text: string): void => {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(text);
};

/**
 * A `node:http` request listener that runs `fetch` for each request:
 * - the `Request` gets the method, URL (on `origin`), headers and, for methods other than
 *   `GET`/`HEAD`, the body as a stream; its `signal` aborts when the client disconnects;
 * - the `Response` body is piped with backpressure (a slow client pauses the stream, so a
 *   `renderPage` body renders as fast as it is read) and cancelled on disconnect;
 * - `HEAD` sends the headers only; each `set-cookie` stays its own header;
 * - an unparsable request target is a 400; a throwing handler a 500 (`onError` sees it).
 */
export function toNodeListener(
  fetch: FetchHandler,
  options: NodeListenerOptions = {},
): NodeListener {
  const onError =
    options.onError ??
    ((error: unknown) => {
      console.error(error);
    });
  return (req, res) => {
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    let sent: Request;
    try {
      sent = toRequest(req, requestUrl(req, options.origin), controller.signal);
    } catch {
      fail(res, 400, 'Bad request');
      return;
    }
    void (async () => {
      try {
        const response = await fetch(sent);
        writeHead(res, response);
        if (req.method === 'HEAD' || response.body === null) {
          await response.body?.cancel();
          res.end();
          return;
        }
        await send(res, response.body, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return; // the client went away: nobody to answer
        onError(error, sent);
        if (!res.headersSent) fail(res, 500, 'Internal server error');
        else res.destroy(); // a cut connection, not a response that looks complete
      }
    })();
  };
}
