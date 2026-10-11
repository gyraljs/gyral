// The route grammar shared by native URLPattern, the segment fallback and href() (ADR 0009).
export type Captures = Readonly<Record<string, string | readonly string[]>>;
export type Compiled = (pathname: string) => Captures | undefined;
export interface PatternLike {
  exec(input: {
    pathname: string;
  }): { pathname: { groups: Record<string, string | undefined> } } | null;
}
export type PatternCtor = new (init: { pathname: string }) => PatternLike;

/** Ignore exactly one trailing slash. Empty interior segments remain significant. */
export const normalize = (path: string): string =>
  path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
const segments = (path: string): string[] => (path === '/' ? [] : path.split('/').slice(1));
const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
interface Parameter {
  readonly name: string;
  readonly modifier: '' | '?' | '*';
}
function parameter(part: string): Parameter | undefined {
  if (!part.startsWith(':')) return undefined;
  const suffix = part.slice(-1);
  const modifier = suffix === '?' || suffix === '*' ? suffix : '';
  return { name: part.slice(1, modifier === '' ? undefined : -1), modifier };
}

/** Accept only the grammar both matchers implement; canonicalize URL-encoded literals. */
export function canonicalPattern(pattern: string): string | undefined {
  if (!pattern.startsWith('/')) return undefined;
  const parts = segments(normalize(pattern));
  if (parts.length === 0 && pattern !== '/') return undefined;
  const names = new Set<string>();
  const out: string[] = [];
  for (const [index, part] of parts.entries()) {
    const param = parameter(part);
    if (param !== undefined) {
      if (
        !/^:[A-Za-z_$][\w$]*[?*]?$/.test(part) ||
        names.has(param.name) ||
        (param.modifier === '*' && index !== parts.length - 1)
      )
        return undefined;
      names.add(param.name);
      out.push(part);
    } else {
      if (part.includes(':') || /[*?+(){}\\#]/.test(part)) return undefined;
      const literal = new URL(part, 'http://gyral.invalid/').pathname.slice(1);
      if (literal === '' || literal.includes('/')) return undefined;
      out.push(literal);
    }
  }
  return `/${out.join('/')}`;
}

export function compileFallback(pattern: string): Compiled {
  const parts = segments(pattern);
  return (pathname) => {
    const input = segments(pathname);
    const visit = (at: number, offset: number): Captures | undefined => {
      const part = parts[at];
      if (part === undefined) return offset === input.length ? {} : undefined;
      const param = parameter(part);
      if (param?.modifier === '*') {
        const rest = input.slice(offset);
        return rest.includes('') ? undefined : { [param.name]: rest.map(decode) };
      }
      const value = input[offset];
      if (param === undefined) return value === part ? visit(at + 1, offset + 1) : undefined;
      if (value !== undefined && value !== '') {
        const rest = visit(at + 1, offset + 1);
        if (rest !== undefined) return { [param.name]: decode(value), ...rest };
      }
      return param.modifier === '?' ? visit(at + 1, offset) : undefined;
    };
    return visit(0, 0);
  };
}

export function compileUrlPattern(Ctor: PatternCtor, pattern: string): Compiled {
  const compiled = new Ctor({ pathname: pattern });
  const params = segments(pattern).flatMap((part) => parameter(part) ?? []);
  return (pathname) => {
    const result = compiled.exec({ pathname });
    // URLPattern's optional leading slash also disappears; the platform's '/' does not.
    if (
      result === null &&
      !(
        pathname === '/' &&
        params.length > 0 &&
        segments(pattern).length === params.length &&
        params.every((p) => p.modifier !== '')
      )
    )
      return undefined;
    const groups: Record<string, string | readonly string[]> = {};
    for (const param of params) {
      const value = result?.pathname.groups[param.name];
      if (param.modifier === '*')
        groups[param.name] = value === undefined ? [] : value.split('/').map(decode);
      else if (value !== undefined) groups[param.name] = decode(value);
    }
    return groups;
  };
}

function encode(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '' || value === '.' || value === '..') {
    throw new TypeError(
      `routes().href(): ${name} must be a nonempty string other than "." or "..".`,
    );
  }
  return encodeURIComponent(value);
}

/** Construct a canonical path; reject optional omissions that would change the captures. */
export function buildHref(pattern: string, values: Captures, test: Compiled): string {
  const out: string[] = [];
  for (const part of segments(pattern)) {
    const param = parameter(part);
    if (param === undefined) {
      out.push(part);
      continue;
    }
    const value = values[param.name];
    if (param.modifier === '*' && Array.isArray(value)) {
      for (const item of value) out.push(encode(item, param.name));
    } else if (param.modifier === '*')
      throw new TypeError(`routes().href(): ${param.name} must be an array.`);
    else if (value !== undefined || param.modifier !== '?') out.push(encode(value, param.name));
  }
  const path = `/${out.join('/')}`;
  if (pattern.includes('?')) {
    const actual = test(path);
    for (const part of segments(pattern)) {
      const param = parameter(part);
      if (
        param !== undefined &&
        JSON.stringify(actual?.[param.name]) !== JSON.stringify(values[param.name])
      ) {
        throw new TypeError(
          'routes().href(): optional parameters are ambiguous; add a literal separator.',
        );
      }
    }
  }
  return path;
}
