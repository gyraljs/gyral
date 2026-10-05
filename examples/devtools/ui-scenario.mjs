// pnpm ui:check devtools: opens the panel via ?devtools and drives the demo so the timeline,
// components and command lanes all have content in the screenshots.
export default {
  steps: [
    { goto: '/?devtools' },
    { waitFor: { role: 'heading', name: 'Gyral devtools' } },
    { click: { role: 'button', name: 'Increment' } },
    { click: { role: 'button', name: 'Save' } },
    { waitFor: { text: 'issued time' } },
    { waitFor: { text: 'Count: 1' } },
  ],
};
