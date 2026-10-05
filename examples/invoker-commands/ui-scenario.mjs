// pnpm ui:check invoker-commands — steps run after the page loads (scripts/ui-check.mjs).
export default {
  steps: [
    { click: { role: 'button', name: 'Add item' } },
    { waitFor: { text: 'List (3)' } },
    { click: { role: 'button', name: 'Clear' } },
    { waitFor: { text: 'List (0)' } },
  ],
};
