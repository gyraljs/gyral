// Opt-in devtools for every example (ADR 0017): add `?devtools` to the URL. Development builds
// only; `vite build` replaces import.meta.env.DEV with false and drops the import entirely.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('devtools')) {
  void import('@gyral/devtools').then(({ mountDevtools }) => {
    mountDevtools({ open: true });
  });
}
