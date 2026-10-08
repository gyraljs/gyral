// Trusted Types (view/01-templates.md "Instantiation", gyral-ei9): a document whose CSP says
// `require-trusted-types-for 'script'` refuses plain strings at HTML sinks such as `innerHTML`.
// The browser parses only two kinds of HTML for Gyral: a template's HTML, which is the author's
// own template strings (holes are markers, never values), and `raw()` markup, trusted by
// contract (view/02 "raw(html)"). Both go through one policy named `gyral`, created on first use
// where the browser has Trusted Types; an app allows it with `trusted-types gyral`. On first use
// rather than at import, so a policy that refuses the name fails where HTML is parsed, not when
// a module loads.

interface Policy {
  createHTML(input: string): string;
}

interface PolicyFactory {
  createPolicy(name: string, rules: Policy): Policy;
}

const passThrough: Policy = { createHTML: (input) => input };

let policy: Policy | undefined;

/**
 * `html` as an HTML sink accepts it: a `TrustedHTML` from the `gyral` policy where the browser
 * has Trusted Types, the string itself elsewhere. Typed as `string` because lib.dom's
 * `innerHTML` setter takes only strings; the browser stringifies a `TrustedHTML` to the same text.
 */
export function trustedHTML(html: string): string {
  policy ??=
    (globalThis as { trustedTypes?: PolicyFactory }).trustedTypes?.createPolicy(
      'gyral',
      passThrough,
    ) ?? passThrough;
  return policy.createHTML(html);
}
