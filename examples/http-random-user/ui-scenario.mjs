// Calls a real public API, so the steps run once (desktop, light) and network errors are tolerated.
export default {
  once: true,
  allowConsole: [/Failed to load resource/],
  steps: [{ click: { role: 'button', name: /random user/i } }, { wait: 1500 }],
};
