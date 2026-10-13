---
'@gyral/core': patch
---

New template rule 15: a JSX-style component reference such as `<SignupForm></SignupForm>` in an
`html` template is now an error in `vite build`, the development runtime and the ESLint
`gyral/template` rule. HTML reads it as an unknown `<signupform>` element that renders nothing,
so the page silently lost the component; the message says to write the tag name the component
was defined with (`<signup-form></signup-form>`) and to import its module. Only names that
start with a capital letter, have no hyphen and are not HTML elements are rejected, so markup
that worked before still builds.
