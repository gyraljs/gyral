// `cssVars({ '--x': v })` as an element hook (view/02-bindings.md "Element hooks", gyral-dyn.19):
// custom properties through the CSSOM, which a strict CSP allows where a `style` attribute is
// blocked.
import { defineHook } from '../view/index.js';

/** Custom properties by name; `null`, `undefined` or `false` removes one. */
export type CssVars = Readonly<Record<`--${string}`, string | number | false | null | undefined>>;

/**
 * Sets the named custom properties on the element with `style.setProperty`, and removes those
 * that are gone or `null`/`undefined`/`false` since the last call. Other inline styles stay:
 *
 *   <div class="bar" ${cssVars({ '--progress': s.done / s.total })}></div>
 *
 * The CSS reads them (`width: calc(var(--progress) * 100%)`). Client only: the server output
 * has no inline style (a CSP would block it), so give each property a default in the
 * stylesheet (`var(--progress, 0)`).
 */
export const cssVars = defineHook<[vars: CssVars]>({
  client: (el, [vars], prev) => {
    const { style } = el as HTMLElement;
    for (const name in prev?.[0]) if (!(name in vars)) style.removeProperty(name);
    for (const [name, value] of Object.entries(vars)) {
      if (value == null || value === false) style.removeProperty(name);
      else style.setProperty(name, String(value));
    }
  },
});
