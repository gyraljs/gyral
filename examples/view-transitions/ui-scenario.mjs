// pnpm ui:check view-transitions: sort by lightness, open a card, then go back.
export default {
  steps: [
    { click: { text: 'Lightness' } },
    { wait: 700 },
    { click: { role: 'button', name: /Teal/ } },
    { waitFor: { role: 'button', name: 'Back to all pigments' } },
    { wait: 700 },
    { click: { role: 'button', name: 'Back to all pigments' } },
    { wait: 700 },
  ],
};
