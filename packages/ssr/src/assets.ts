/// <reference types="node" />
// Serving content-hashed build assets (ADR 0016 "Serving assets", gyral-dyn.1). Node-only (it
// reads files), exported from `@gyral/ssr/static`. Usable alone: a host that keeps every
// release's hashed files on a persistent volume points `dir` there, so a tab opened before a
// deploy still loads the chunks of its own release.
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

/** Cache policy for production serving. */
export const cacheHeaders = {
  /** Content-hashed build assets never change: cache for a year. */
  immutable: { 'cache-control': 'public, max-age=31536000, immutable' },
  /** Prerendered pages may be rebuilt: always revalidate. */
  revalidate: { 'cache-control': 'public, max-age=0, must-revalidate' },
  /** Per-request pages may be personalized. */
  dynamic: { 'cache-control': 'no-cache' },
  /** Misses and errors: never stored, so a file arriving with the next deploy is found. */
  none: { 'cache-control': 'no-store' },
} as const;

const TEXT = 'charset=utf-8';

/** Content types by extension: what a Vite build emits. Anything else is octet-stream. */
const ASSET_TYPES: Readonly<Record<string, string>> = {
  '.js': `text/javascript; ${TEXT}`,
  '.mjs': `text/javascript; ${TEXT}`,
  '.css': `text/css; ${TEXT}`,
  '.map': `application/json; ${TEXT}`,
  '.json': `application/json; ${TEXT}`,
  '.webmanifest': `application/manifest+json; ${TEXT}`,
  '.txt': `text/plain; ${TEXT}`,
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

/** The `content-type` served for a file name (by extension). */
export const contentType = (file: string): string =>
  ASSET_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';

/** A plain-text error that no cache keeps. */
export const errorResponse = (
  status: number,
  text: string,
  extra: Readonly<Record<string, string>> = {},
): Response =>
  new Response(text, {
    status,
    headers: {
      'content-type': `text/plain; ${TEXT}`,
      'x-content-type-options': 'nosniff',
      ...cacheHeaders.none,
      ...extra,
    },
  });

/** A file response: the body for GET, the same headers without it for HEAD. */
export function fileResponse(
  method: string,
  body: Uint8Array<ArrayBuffer>,
  type: string,
  cache: Readonly<Record<string, string>>,
): Response {
  return new Response(method === 'HEAD' ? null : body, {
    headers: {
      'content-type': type,
      'content-length': String(body.byteLength),
      'x-content-type-options': 'nosniff',
      ...cache,
    },
  });
}

export async function readOrUndefined(file: string): Promise<Uint8Array<ArrayBuffer> | undefined> {
  try {
    return new Uint8Array(await readFile(file));
  } catch {
    return undefined; // missing, a directory, unreadable: all a miss
  }
}

export interface AssetHandlerOptions {
  /** The directory served under `prefix`, e.g. `dist/client/assets`. */
  readonly dir: string;
  /** The URL path prefix, with both slashes. Default `/assets/`. */
  readonly prefix?: string;
  /**
   * Keep served files in memory (hashed files never change): `true` (default) up to 64 MiB,
   * `{ maxBytes }` for another bound (least recently served files are dropped first), `false`
   * to read every request from disk. Misses are never cached.
   */
  readonly cache?: boolean | { readonly maxBytes: number };
}

/**
 * Answers a request under the prefix, `undefined` for any other path. Never throws.
 */
export type AssetHandler = (request: Request) => Promise<Response | undefined>;

const DEFAULT_CACHE_BYTES = 64 * 1024 * 1024;

/** A byte-bounded map that forgets the least recently used entries. */
function memo(maxBytes: number) {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let bytes = 0;
  return {
    get(key: string): Uint8Array<ArrayBuffer> | undefined {
      const hit = files.get(key);
      if (hit !== undefined) {
        files.delete(key); // re-inserted: the most recently served entry is last
        files.set(key, hit);
      }
      return hit;
    },
    set(key: string, body: Uint8Array<ArrayBuffer>): void {
      const old = files.get(key);
      if (old !== undefined) {
        files.delete(key);
        bytes -= old.byteLength;
      }
      if (body.byteLength > maxBytes) return;
      for (const [old, oldBody] of files) {
        if (bytes + body.byteLength <= maxBytes) break;
        files.delete(old);
        bytes -= oldBody.byteLength;
      }
      files.set(key, body);
      bytes += body.byteLength;
    },
  };
}

/**
 * Serves content-hashed files from `dir` at `prefix` (`/assets/` by default) for GET and HEAD,
 * with `cache-control: public, max-age=31536000, immutable`, `content-type` by extension,
 * `content-length` and `x-content-type-options: nosniff`. Paths that are not under `dir` after
 * decoding (`..`, encoded slashes leading out) or have a dot segment (`.hidden`) are refused;
 * a malformed escape is a 400. Misses are 404 with `cache-control: no-store`, so a CDN never
 * keeps a miss for a file the next deploy brings. Other methods get 405.
 */
export function assetHandler(options: AssetHandlerOptions): AssetHandler {
  const root = resolve(options.dir);
  const prefix = options.prefix ?? '/assets/';
  if (!prefix.startsWith('/') || !prefix.endsWith('/')) {
    throw new Error(`assetHandler: prefix must start and end with "/", got "${prefix}"`);
  }
  const setting = options.cache ?? true;
  const cache =
    setting === false ? undefined : memo(setting === true ? DEFAULT_CACHE_BYTES : setting.maxBytes);
  // Concurrent misses of one file share one read (a deploy's first requests often arrive together).
  const reading = new Map<string, Promise<Uint8Array<ArrayBuffer> | undefined>>();
  const read = (file: string): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    let pending = reading.get(file);
    if (pending === undefined) {
      pending = readOrUndefined(file).then((body) => {
        reading.delete(file);
        if (body !== undefined) cache?.set(file, body);
        return body;
      });
      reading.set(file, pending);
    }
    return pending;
  };
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(prefix)) return undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, 'Method not allowed', { allow: 'GET, HEAD' });
    }
    let name: string;
    try {
      name = decodeURIComponent(pathname.slice(prefix.length));
    } catch {
      return errorResponse(400, 'Bad request');
    }
    const parts = name.split(/[/\\]/);
    if (name.includes('\0') || parts.some((part) => part === '' || part.startsWith('.'))) {
      return errorResponse(404, 'Not found');
    }
    const file = resolve(root, ...parts);
    if (!file.startsWith(`${root}${sep}`)) return errorResponse(404, 'Not found');
    const body = cache?.get(file) ?? (await read(file));
    if (body === undefined) return errorResponse(404, 'Not found');
    return fileResponse(request.method, body, contentType(file), cacheHeaders.immutable);
  };
}
