// Typed route tables (ADR 0009). Pure: the same table serves browser navigation and SSR.
import {
  buildHref,
  canonicalPattern,
  compileFallback,
  compileUrlPattern,
  normalize,
  type Captures,
  type PatternCtor,
} from './route-pattern.js';

type Param<Segment extends string> = Segment extends `:${infer Name}?`
  ? { readonly [K in Name]?: string }
  : Segment extends `:${infer Name}*`
    ? { readonly [K in Name]: readonly string[] }
    : Segment extends `:${infer Name}`
      ? { readonly [K in Name]: string }
      : object;

/** Named required strings, optional strings and trailing catch-all arrays, inferred by path. */
export type Params<Path extends string> = Path extends `${infer Head}/${infer Rest}`
  ? Param<Head> & Params<Rest>
  : Param<Path>;
export type RouteTable = Readonly<Record<string, string>>;

/** The route name discriminates its params. `path` is the canonical href for those captures. */
export type RouteMatch<T extends RouteTable> = {
  [N in keyof T & string]: {
    readonly name: N;
    readonly params: Params<T[N]>;
    readonly path: string;
  };
}[keyof T & string];
export type Matcher = 'auto' | 'urlpattern' | 'fallback';
export interface Routes<T extends RouteTable> {
  readonly table: T;
  /** First route in table order matching the pathname. A string beginning with / is a path. */
  match(url: string | URL): RouteMatch<T> | undefined;
  /** Percent-encode each parameter or catch-all segment; omit absent optional parameters. */
  href<N extends keyof T & string>(name: N, params: Params<T[N]>): string;
}

export function routes<const T extends RouteTable>(
  table: T,
  options: { readonly matcher?: Matcher } = {},
): Routes<T> {
  const Ctor =
    options.matcher === 'fallback'
      ? undefined
      : (globalThis as { URLPattern?: PatternCtor }).URLPattern;
  if (options.matcher === 'urlpattern' && Ctor === undefined) {
    throw new Error('routes(): URLPattern is not available in this environment.');
  }
  const compiled = Object.entries(table).map(([name, pattern]) => {
    const canonical = canonicalPattern(pattern);
    if (canonical === undefined)
      throw new Error(
        `routes(): pattern "${pattern}" for "${name}" must start with "/" and use only literal and :param segments, optional :param? segments or a trailing :path* (ADR 0009).`,
      );
    return {
      name,
      canonical,
      test:
        typeof Ctor === 'function'
          ? compileUrlPattern(Ctor, canonical)
          : compileFallback(canonical),
    };
  });
  const byName = new Map(compiled.map((entry) => [entry.name, entry]));
  const href = <N extends keyof T & string>(name: N, params: Params<T[N]>): string => {
    const entry = byName.get(name);
    if (entry === undefined) throw new TypeError(`routes().href(): unknown route "${name}".`);
    return buildHref(entry.canonical, params as Captures, entry.test);
  };
  const match = (url: string | URL): RouteMatch<T> | undefined => {
    const base = 'http://gyral.invalid';
    const path = typeof url === 'string' && url.startsWith('/') ? base + url : url;
    const pathname = normalize(new URL(path, base).pathname);
    for (const { name, canonical, test } of compiled) {
      const params = test(pathname);
      if (params !== undefined)
        return { name, params, path: buildHref(canonical, params, test) } as RouteMatch<T>;
    }
    return undefined;
  };
  return { table, match, href };
}
