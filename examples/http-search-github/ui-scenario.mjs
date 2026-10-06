// Calls the GitHub search API (rate limited), so the steps run once and network errors are tolerated.
export default {
  once: true,
  allowConsole: [/Failed to load resource/],
  steps: [{ fill: { label: 'Repository name' }, value: 'cyclejs' }, { wait: 2500 }],
};
