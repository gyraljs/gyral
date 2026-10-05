// pnpm ui:check typeahead-race: type fast so the naive panel ends up stale.
export default {
  steps: [
    { press: 'Tab' },
    { press: 'v' },
    { press: 'i' },
    { press: 'e' },
    { press: 'w' },
    { wait: 1200 },
    { waitFor: { text: 'Stale!' } },
  ],
};
