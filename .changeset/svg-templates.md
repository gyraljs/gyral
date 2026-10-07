---
'@gyral/core': patch
---

`svg` templates are back, for SVG fragments that are templates of their own: `` svg`<path d=${d} />` ``, rendered inside an `<svg>` of an `html` template (conditionally, nested, or as `each` rows). Their top level is SVG content (SVG elements, self-closing tags, camelCase names such as `clipPath` and `viewBox`); HTML there is a template error pointing to `html` or `<foreignObject>`, and an `html` template's SVG-only top level now points to `svg`. Rendering one outside SVG content is a development error on the client and the server. The Vite compiler compiles `svg` call sites (into `compiledSvg`, from `@gyral/core/compiled`), its bundle check covers `svg`, and `gyral/template` checks them in the editor. Apps that don't use `svg` don't carry its code.

Also: bound attribute names on SVG elements take the HTML parser's spelling (`viewbox=${v}` binds `viewBox`), bound namespaced attributes (`xlink:href=${v}`) are a template error pointing to SVG 2's `href`, HTML-only elements inside SVG content (`<button>` in `<svg>`) are a template error, and whitespace with a newline at the inside edges of `<svg>` is dropped like at a block edge.

In development `svg` templates name their call site in template errors and hydration mismatches, as `html` ones do (the `gyral:template-locations` plugin rewrites `svg` call sites with `svg.at`); `gyral/unused-intent` counts intents named in `svg` templates, and the function-in-property-binding warning and `gyral/template`'s closure check cover them too.
