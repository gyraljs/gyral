// Calls Wikipedia, so the steps run once (desktop, light) and network errors are tolerated.
export default {
  once: true,
  allowConsole: [/Failed to load resource/],
  steps: [
    { fill: { role: 'combobox' }, value: 'cycl' },
    { wait: 2500 },
    { press: 'ArrowDown' },
    { wait: 200 },
  ],
};
