// Template ids (view/01-templates.md "Template ids"): a deterministic 53-bit hash of the
// normalized strings, printed in base 36. Two independent 32-bit multiply-xorshift lanes over
// the UTF-16 code units, with each string's length mixed in first so ["a", "b"] and ["ab"]
// differ; a final avalanche, then 21 bits of one lane and 32 of the other. Only Math.imul and
// integer ops: the same result in Node, browsers and the compiler.

function mix(h: number, k: number, m: number): number {
  return Math.imul(h ^ k, m);
}

function avalanche(h: number, a: number, b: number): number {
  let x = Math.imul(h ^ (h >>> 16), a);
  x = Math.imul(x ^ (x >>> 13), b);
  return x ^ (x >>> 16);
}

/**
 * The id of a template's normalized strings. `svg`: an svg template's (01 "svg templates"),
 * whose DOM differs from an html template's with the same strings, so its id does too.
 */
export function templateId(strings: readonly string[], svg = false): string {
  let h1 = 0x9e3779b9 ^ strings.length;
  let h2 = 0x85ebca6b ^ strings.length;
  if (svg) {
    h1 = mix(h1, 0x737667, 0x2d51);
    h2 = mix(h2, 0x737667, 0x1b873593);
  }
  for (const s of strings) {
    h1 = mix(h1, s.length, 0x2d51);
    h2 = mix(h2, s.length, 0x1b873593);
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      h1 = mix(h1, c, 0x9e3779b1);
      h2 = mix(h2, c, 0x5bd1e995);
    }
  }
  const lo = avalanche(h1 ^ Math.imul(h2, 0x27d4eb2f), 0x85ebca6b, 0xc2b2ae35) >>> 0;
  const hi = avalanche(h2 ^ lo, 0x2c1b3c6d, 0x297a2d39) & 0x1fffff;
  return (hi * 0x100000000 + lo).toString(36);
}

const seen = new Map<string, string>();

/**
 * Development: records `id` → strings and warns once when two different normalized templates
 * share an id (the compiler fails the build instead).
 */
export function recordTemplateId(id: string, strings: readonly string[]): void {
  const key = JSON.stringify(strings);
  const known = seen.get(id);
  if (known === undefined) seen.set(id, key);
  else if (known !== key) {
    console.warn(
      `gyral: two different templates share the id ${id}; server output and hydration may ` +
        `confuse them. Change one template slightly (e.g. add a class) and report this ` +
        `collision.\n  ${known}\n  ${key}`,
    );
    seen.set(id, key);
  }
}
