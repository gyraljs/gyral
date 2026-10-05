// pnpm ui:check themes: tick a task, then switch to the Paper theme for the capture.
export default {
  steps: [
    { click: { text: 'Record the demo videos' } },
    { click: { text: 'Paper' } },
    { wait: 500 },
  ],
};
