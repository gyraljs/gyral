---
'@gyral/core': patch
---

Development builds warn (G0014) when a custom-element tag on the page stays undefined 3 seconds after load or after a later `define()`, which usually means the entry never imports the component's module. Template rule 15 now runs in the browser only in development: `vite build` with the preset and ESLint still reject `<SignupForm>`, and production bundles built without the preset no longer carry the list of HTML element names (about 0.4 KiB gzip).
