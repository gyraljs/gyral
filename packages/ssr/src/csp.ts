// A Content-Security-Policy for server-rendered pages (view/06-server.md "CSP", view/08-styles.md
// "Server"): every shadow component's declarative-shadow-root `<style>` and the page's global
// `<style>` elements are allowed by their SHA-256 hashes, so `style-src` needs no
// 'unsafe-inline'. Hashes come from WebCrypto, so this is async; they are cached per text.
import { styleHash, styleHashes } from '@gyral/core/server';
import { styleList, styleSafe } from './page.js';

/** CSP directives by name: a source list, as one string or a list of sources. */
export type CspDirectives = Readonly<Record<string, string | readonly string[]>>;

export interface CspOptions {
  /**
   * Your other directives (`default-src`, `script-src`, …). A `style-src` given here is kept
   * and the hashes are appended; without one it is `'self'` plus the hashes.
   */
  readonly directives?: CspDirectives;
  /** The page's global styles, exactly as passed to `page({ styles })`, hashed too. */
  readonly styles?: string | readonly string[];
}

const sources = (value: string | readonly string[]): readonly string[] =>
  typeof value === 'string' ? value.split(/\s+/).filter((s) => s !== '') : value;

/**
 * A `Content-Security-Policy` header value whose `style-src` allows Gyral's `<style>`
 * elements by hash. Pass it to `renderPage({ …, csp })` or set it on any response. Other
 * inline styles (`style` attributes, hand-written `<style>` in `head`) are not covered.
 */
export async function contentSecurityPolicy(options: CspOptions = {}): Promise<string> {
  const { directives = {}, styles } = options;
  const page = await Promise.all(styleList(styles).map((css) => styleHash(styleSafe(css))));
  const hashes = [...new Set([...(await styleHashes()), ...page])];
  const style = [...sources(directives['style-src'] ?? "'self'"), ...hashes];
  const policy: [name: string, sources: readonly string[]][] = Object.entries(directives)
    .filter(([name]) => name !== 'style-src')
    .map(([name, value]) => [name, sources(value)]);
  policy.push(['style-src', style]);
  return policy.map(([name, list]) => [name, ...list].join(' ')).join('; ');
}
