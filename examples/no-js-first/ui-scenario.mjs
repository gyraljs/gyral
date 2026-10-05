// pnpm ui:check no-js-first: with JavaScript on, a half-typed email shows its error at once.
export default {
  steps: [
    { waitFor: { text: 'JavaScript on.' } },
    { fill: { label: 'Name' }, value: 'Ada' },
    { fill: { label: 'Email' }, value: 'ada@' },
    { waitFor: { text: 'Enter a valid email address.' } },
  ],
};
