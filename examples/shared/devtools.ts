// Opt-in devtools for every example (ADR 0017): add `?devtools` to the URL. Development builds
// only; `vite build` replaces import.meta.env.DEV with false and drops the import entirely.
// Imported by component modules, so it also runs in the dev server's SSR, where there's no
// `location`.
if (
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('devtools')
) {
  void import('@gyral/devtools').then(({ mountDevtools }) => {
    mountDevtools({ open: true });
  });
}
