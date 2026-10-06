---
'@gyral/core': minor
---

`html` and `svg` remove indentation whitespace between tags (once per template, on server and
client alike), so lists build far fewer DOM nodes. Inline spacing is kept as one space; `<pre>`,
`<textarea>`, `<script>`, `<style>`, attributes and comments are unchanged. For exact whitespace
under CSS `white-space: pre*`, use `html` from `lit`.
