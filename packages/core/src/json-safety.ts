// Seeds are JSON (ADR 0012). A value that doesn't survive JSON.stringify → JSON.parse unchanged
// makes the client hydrate from different state than the server rendered (gyral-4k7.5).

const plain = (value: object): boolean => {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/**
 * The first place where `value` would change across a JSON round trip, as `path: reason`, or
 * `undefined` when it is JSON-safe. `undefined` object properties are allowed (they vanish, and
 * reading them still gives `undefined`).
 */
export function jsonHazard(
  value: unknown,
  path: string,
  seen = new Set<object>(),
): string | undefined {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return undefined;
    case 'number':
      return Number.isFinite(value) ? undefined : `${path} is ${String(value)} (becomes null)`;
    case 'undefined':
      return `${path} is undefined (dropped, or null in an array)`;
    case 'function':
    case 'symbol':
      return `${path} is a ${typeof value} (dropped)`;
    case 'bigint':
      return `${path} is a bigint (JSON can't encode it)`;
    case 'object':
      break;
  }
  if (value === null) return undefined;
  if (seen.has(value)) return `${path} is a circular reference`;
  if (value instanceof Date) return `${path} is a Date (becomes a string)`;
  if (Array.isArray(value)) {
    seen.add(value);
    for (const [index, item] of value.entries()) {
      const found = jsonHazard(item, `${path}[${String(index)}]`, seen);
      if (found !== undefined) return found;
    }
    seen.delete(value);
    return undefined;
  }
  if (!plain(value)) {
    const name = (value.constructor as { name?: string } | undefined)?.name ?? 'object';
    return `${path} is a ${name} (becomes a plain object)`;
  }
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    const found = jsonHazard(item, `${path}.${key}`, seen);
    if (found !== undefined) return found;
  }
  seen.delete(value);
  return undefined;
}

/** Warns (server side) when a seed would hydrate differently from what was rendered. */
export function warnJsonHazard(owner: string, value: unknown, path: string): void {
  const found = jsonHazard(value, path);
  if (found !== undefined) {
    console.warn(
      `${owner}: ${found}, so the client would hydrate from different data than the ` +
        'server rendered. Keep seeded state and props JSON-safe (ADR 0012).',
    );
  }
}
