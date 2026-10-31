// A stand-in for an embedded SSR host (ADR 0034), for embedded-protocol.node.test.ts. It builds a
// server bundle the way gyral-rs's example does (tools/build-example.mjs: esbuild, one IIFE,
// `platform: 'neutral'`, production) and runs it in a `node:vm` context that offers only
// protocol 1's host profile, what deno_core 0.412 gives a bundle: the ECMAScript built-ins and
// Intl (V8's own, as in any vm context), plus queueMicrotask and console. Anything else the
// server code reaches for (TextEncoder, btoa, timers, fetch, URL, crypto, …) is a
// ReferenceError, as it is in gyral-rs.
import { createContext, runInContext, type Context } from 'node:vm';
import { build } from 'esbuild';

/** The globals protocol 1's host adds to the ECMAScript built-ins (and Intl). */
export const HOST_GLOBALS = ['queueMicrotask', 'console'] as const;

/**
 * Globals Node, Deno or browsers have that protocol 1's host doesn't: server code that needs
 * one at load or render time breaks in gyral-rs. Checked absent from the host profile.
 */
export const ABSENT_GLOBALS = [
  'TextEncoder',
  'TextDecoder',
  'btoa',
  'atob',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'fetch',
  'Request',
  'Response',
  'Headers',
  'ReadableStream',
  'URL',
  'URLSearchParams',
  'crypto',
  'structuredClone',
  'performance',
  'document',
  'window',
  'navigator',
  'process',
  'Buffer',
] as const;

/** The server bundle's source, built from `entry` with gyral-rs's example's esbuild options. */
export async function buildServerBundle(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    minify: true,
    target: 'es2022',
    define: { 'process.env.NODE_ENV': '"production"' },
    format: 'iife',
    platform: 'neutral',
    logLevel: 'silent',
  });
  const [output] = result.outputFiles;
  if (output === undefined || result.outputFiles.length !== 1) {
    throw new Error('Protocol 1 needs the server bundle in one file');
  }
  return output.text;
}

export interface LogEntry {
  readonly level: string;
  readonly text: string;
}

export interface EmbeddedHost {
  /** Evaluates a classic script in the host, as gyral-rs evaluates the bundle. */
  readonly evaluate: (source: string) => unknown;
  /** `gyralRender(JSON.parse(request))`, called the way gyral-rs calls it. */
  readonly render: (request: unknown) => Promise<unknown>;
  /** Everything the bundle wrote to `console`. */
  readonly logs: readonly LogEntry[];
}

// Installed inside the context, so the bundle sees host functions of its own realm.
const PROFILE = `(record) => {
  const write = (level) => (...args) => record(level, args.map(String).join(' '));
  globalThis.console = {
    debug: write('debug'), error: write('error'), info: write('info'),
    log: write('log'), trace: write('trace'), warn: write('warn'),
  };
  globalThis.queueMicrotask = (callback) => { Promise.resolve().then(() => callback()); };
}`;

/** A fresh host: a new context per render, as gyral-rs uses a fresh isolate per request. */
export function embeddedHost(): EmbeddedHost {
  const context: Context = createContext({});
  const logs: LogEntry[] = [];
  const install = runInContext(PROFILE, context) as (
    record: (level: string, text: string) => void,
  ) => void;
  install((level, text) => logs.push({ level, text }));
  const evaluate = (source: string): unknown =>
    runInContext(source, context, { filename: 'gyral-app.js' });
  return {
    evaluate,
    logs,
    // gyral-rs passes the request as a JSON string literal through JSON.parse.
    render: async (request) =>
      await evaluate(
        `globalThis.gyralRender(JSON.parse(${JSON.stringify(JSON.stringify(request))}))`,
      ),
  };
}

/** The error a rejected render settled with, read across realms (no `instanceof`). */
export async function rejection(
  promise: Promise<unknown>,
): Promise<{ name: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const { name, message } = error as { name?: unknown; message?: unknown };
    return { name: String(name), message: String(message) };
  }
  throw new Error('The render resolved; it should have rejected');
}
