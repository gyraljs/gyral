// Typed route tables (docs/design-docs/0009-router.md). Pure: no window access, so the same
// table matches URLs on the server (SSR) and in the browser.

type Param<Segment extends string> = Segment extends `:${infer Name}` ? Name : never;
type ParamNames<Path extends string> = Path extends `${infer Head}/${infer Rest}`
  ? Param<Head> | ParamNames<Rest>
  : Param<Path>;

/** `Params<'/users/:id'>` is `{ readonly id: string }`. */
export type Params<Path extends string> = { readonly [K in ParamNames<Path>]: string };

export type RouteTable = Readonly<Record<string, string>>;

/** A matched route: its name and decoded params, discriminated by `name`. */
export type RouteMatch<T extends RouteTable> = {
  [N in keyof T & string]: { readonly name: N; readonly params: Params<T[N]> };
}[keyof T & string];

export type Matcher = 'auto' | 'urlpattern' | 'fallback';

export interface Routes<T extends RouteTable> {
  readonly table: T;
  /** First route (in table order) whose pathname pattern matches `url`, or `undefined`. */
  match(url: string | URL): RouteMatch<T> | undefined;
  /** Builds a path for a route, percent-encoding params. */
  href<N extends keyof T & string>(name: N, params: Params<T[N]>): string;
}

type Groups = Readonly<Record<string, string>>;
type Compiled = (pathname: string) => Groups | undefined;

// Minimal shape of URLPattern; it is not Baseline widely available (ADR 0003).
interface PatternLike {
  exec(input: {
    pathname: string;
  }): { pathname: { groups: Record<string, string | undefined> } } | null;
}
type PatternCtor = new (init: { pathname: string }) => PatternLike;

const urlPatternCtor = (): PatternCtor | undefined => {
  const ctor = (globalThis as { URLPattern?: PatternCtor }).URLPattern;
  return typeof ctor === 'function' ? ctor : undefined;
};

/** Trailing slashes are ignored (except the root) so both matchers agree. */
const normalize = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

const segments = (path: string): string[] => path.split('/').filter((s) => s !== '');

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

function compileFallback(pattern: string): Compiled {
  const parts = segments(pattern);
  return (pathname) => {
    const segs = segments(pathname);
    if (segs.length !== parts.length) return undefined;
    const groups: Record<string, string> = {};
    for (const [index, part] of parts.entries()) {
      const seg = segs[index] ?? '';
      if (part.startsWith(':')) groups[part.slice(1)] = decode(seg);
      else if (part !== seg) return undefined;
    }
    return groups;
  };
}

function compileUrlPattern(Ctor: PatternCtor, pattern: string): Compiled {
  const compiled = new Ctor({ pathname: normalize(pattern) });
  return (pathname) => {
    const result = compiled.exec({ pathname });
    if (result === null) return undefined;
    const groups: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.pathname.groups)) {
      groups[key] = decode(value ?? '');
    }
    return groups;
  };
}

const UNSUPPORTED = /[*?+(){}\\]/;

/**
 * Declares a route table. Patterns are literal segments and `:param` segments only, so the
 * URLPattern and fallback matchers behave identically. `matcher` is for tests.
 */
export function routes<const T extends RouteTable>(
  table: T,
  options: { readonly matcher?: Matcher } = {},
): Routes<T> {
  const Ctor = options.matcher === 'fallback' ? undefined : urlPatternCtor();
  if (options.matcher === 'urlpattern' && Ctor === undefined) {
    throw new Error('routes(): URLPattern is not available in this environment.');
  }
  const compiled = Object.entries(table).map(([name, pattern]) => {
    if (!pattern.startsWith('/') || UNSUPPORTED.test(pattern)) {
      throw new Error(
        `routes(): pattern "${pattern}" for "${name}" must start with "/" and use only literal ` +
          'and :param segments (docs/design-docs/0009-router.md).',
      );
    }
    return {
      name,
      test: Ctor === undefined ? compileFallback(pattern) : compileUrlPattern(Ctor, pattern),
    };
  });

  const match = (url: string | URL): RouteMatch<T> | undefined => {
    const pathname = normalize(new URL(url, 'http://gyral.invalid').pathname);
    for (const { name, test } of compiled) {
      const params = test(pathname);
      if (params !== undefined) return { name, params } as RouteMatch<T>;
    }
    return undefined;
  };

  const href = <N extends keyof T & string>(name: N, params: Params<T[N]>): string => {
    const values = params as Groups;
    const path = segments(table[name] ?? '/')
      .map((part) =>
        part.startsWith(':') ? encodeURIComponent(values[part.slice(1)] ?? '') : part,
      )
      .join('/');
    return `/${path}`;
  };

  return { table, match, href };
}
