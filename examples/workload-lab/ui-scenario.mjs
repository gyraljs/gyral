export default {
  steps: [
    { click: { role: 'button', name: 'Show playback notes' } },
    { click: { role: 'button', name: 'Start sequence' } },
    { waitFor: { text: 'Sequence complete' } },
    { click: { role: 'button', name: 'Generate in worker' } },
    { waitFor: { text: 'Worker result:' } },
    { fill: { label: 'Quantity (1–8)' }, value: '3' },
    { check: { label: 'Confirm this reservation' } },
    { click: { role: 'button', name: 'Save Morning class' } },
    { waitFor: { text: 'Write committed and snapshot refreshed' } },
    { click: { role: 'button', name: 'Row 3, column 3' } },
    { waitFor: { css: 'gy-workload-grid canvas[data-ready="true"]' } },
  ],
};
