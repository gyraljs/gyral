// JSON safe to inline in a <script> element. Its own module: head.ts (the head model) and the
// store seeds both use it, and keeping it out of store-scope.ts stops a bundler from turning
// the store registry into a shared chunk every page loads (gyral-dyn.35).

/** JSON for an inline `<script type="application/json">`: `</script>` and friends escaped. */
export function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}
