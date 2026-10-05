export default {
  steps: [
    { click: { role: 'link', name: 'About' } },
    { waitFor: { role: 'heading', name: 'About me' } },
  ],
};
