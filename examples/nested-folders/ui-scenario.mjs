export default {
  steps: [
    { click: { role: 'button', name: 'Add folder' } },
    { click: { role: 'button', name: 'Add folder' } },
    { waitFor: { text: 'Folder 1.2' } },
  ],
};
