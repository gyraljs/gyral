// pnpm ui:check counter — steps run after the page loads (scripts/ui-check.mjs).
export default {
  steps: [
    { click: { role: 'button', name: 'Increment' } },
    { click: { role: 'button', name: 'Increment' } },
    { waitFor: { text: 'Counter: 2' } },
  ],
};
