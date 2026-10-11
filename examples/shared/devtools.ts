// Opt-in devtools for every example (ADR 0017): add `?devtools` to the URL. Development builds
// only; `vite build` replaces import.meta.env.DEV with false and drops the import entirely.
// Imported by component modules, so it also runs on the server (Vite's SSR, or plain Node in
// production, where there's no import.meta.env either): the `location` check comes first.
if (
  typeof location !== 'undefined' &&
  import.meta.env.DEV &&
  new URLSearchParams(location.search).has('devtools')
) {
  void import('@gyral/devtools').then(({ mountDevtools }) => {
    mountDevtools({ open: true });
  });
}
