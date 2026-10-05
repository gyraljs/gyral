// pnpm ui:check undo-replay: paint a few pixels, undo one, so the capture shows history.
export default {
  steps: [
    { click: { role: 'radio', name: 'red' } },
    { click: { role: 'button', name: 'row 1, column 1: empty' } },
    { click: { role: 'button', name: 'row 1, column 2: empty' } },
    { click: { role: 'button', name: 'row 2, column 2: empty' } },
    { click: { role: 'button', name: 'Undo' } },
    { waitFor: { text: 'Edit 2 of 3' } },
  ],
};
