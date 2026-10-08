// Typed route tables (docs/design-docs/0009-router.md). Pure: no window access, so the same
// table matches URLs on the server (SSR) and in the browser.

type Param<Segment extends string> = Segment extends `:${infer Name}` ? Name : never;
type ParamNames<Path extends string> = Path extends `${infer Head}/${infer Rest}`
  ? Param<Head> | ParamNames<Rest>
  : Param<Path>;

/** `Params<'/users/:id'>` is `{ readonly id: string }`. */
export type Params<Path extends string> = { readonly [K in ParamNames<Path>]: string };

export type RouteTable = Readonly<Record<string, string>>;

/**
 * A matched route: its name, decoded params and canonical path, discriminated by `name`.
 * `path` is `href(name, params)`: the one path this page answers at. A URL whose pathname
 * differs (a trailing slash, `%c3%bc` for `%C3%BC`) matched the same route; a server redirects
 * it to `path` (ADR 0009 "Canonical paths").
 */
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
  /**
   * First route (in table order) whose pathname pattern matches `url`, or `undefined`. A string
   * starting with `/` is a path (`//a/b` too, never a host).
   */
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

/** One trailing slash is ignored (except the root's) so both matchers agree. */
const normalize = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

/** Every segment after the leading `/`, empty ones included (`//` never collapses). */
const segments = (path: string): string[] => path.split('/').slice(1);

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** A literal segment as a URL's pathname spells it (`café` → `caf%C3%A9`), as URLPattern does. */
const canonicalLiteral = (part: string): string =>
  new URL(part, 'http://gyral.invalid/').pathname.slice(1);

function compileFallback(pattern: string): Compiled {
  const parts = segments(pattern);
  return (pathname) => {
    const segs = segments(pathname);
    if (segs.length !== parts.length) return undefined;
    const groups: Record<string, string> = {};
    for (const [index, part] of parts.entries()) {
      const seg = segs[index] ?? '';
      if (!part.startsWith(':')) {
        if (part !== seg) return undefined;
      } else if (seg === '')
        return undefined; // a param is never empty (as in URLPattern)
      else groups[part.slice(1)] = decode(seg);
    }
    return groups;
  };
}

function compileUrlPattern(Ctor: PatternCtor, pattern: string): Compiled {
  const compiled = new Ctor({ pathname: pattern });
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

const UNSUPPORTED = /[*?+(){}\\#]/;
const PARAM = /^:[A-Za-z_$][\w$]*$/;

/**
 * The pattern with its literal segments canonical, or `undefined` when it uses syntax the two
 * matchers would read differently: URLPattern-only syntax, an empty or dot segment, a `:` that
 * doesn't start a segment, a param name that isn't an identifier, or a param named twice.
 */
function canonicalPattern(pattern: string): string | undefined {
  if (!pattern.startsWith('/') || UNSUPPORTED.test(pattern)) return undefined;
  if (pattern === '/') return pattern;
  let out = '';
  for (const part of segments(normalize(pattern))) {
    // A param once, or a literal without `:`; an empty, `.` or `..` (or `%2e`) literal is ''.
    const canonical = part.startsWith(':')
      ? PARAM.test(part) && !`${out}/`.includes(`/${part}/`)
        ? part
        : ''
      : part.includes(':')
        ? ''
        : canonicalLiteral(part);
    if (canonical === '' || canonical.includes('/')) return undefined;
    out += `/${canonical}`;
  }
  return out;
}

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
  const patterns = new Map<string, string>();
  const compiled = Object.entries(table).map(([name, pattern]) => {
    const canonical = canonicalPattern(pattern);
    if (canonical === undefined) {
      throw new Error(
        `routes(): pattern "${pattern}" for "${name}" must start with "/" and use only literal ` +
          'and :param segments (docs/design-docs/0009-router.md).',
      );
    }
    patterns.set(name, canonical);
    return {
      name,
      test: Ctor === undefined ? compileFallback(canonical) : compileUrlPattern(Ctor, canonical),
    };
  });

  const href = <N extends keyof T & string>(name: N, params: Params<T[N]>): string => {
    const values = params as Groups;
    const path = segments(patterns.get(name) ?? '/')
      .map((part) =>
        part.startsWith(':') ? encodeURIComponent(values[part.slice(1)] ?? '') : part,
      )
      .join('/');
    return `/${path}`;
  };

  const match = (url: string | URL): RouteMatch<T> | undefined => {
    const base = 'http://gyral.invalid';
    const path = typeof url === 'string' && url.startsWith('/') ? base + url : url;
    const pathname = normalize(new URL(path, base).pathname);
    for (const { name, test } of compiled) {
      const params = test(pathname);
      if (params !== undefined) {
        return { name, params, path: href(name, params as never) } as RouteMatch<T>;
      }
    }
    return undefined;
  };

  return { table, match, href };
}
