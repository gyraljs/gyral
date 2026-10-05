// Fills a too-short password so validation errors render (the page is captured with them).
export default {
  steps: [
    { fill: { label: 'Name' }, value: 'ada' },
    { fill: { label: 'Email' }, value: 'ada@example.com' },
    { fill: { label: 'Password', exact: true }, value: 'short' },
    { fill: { label: 'Repeat password' }, value: 'short' },
    { click: { role: 'button', name: 'Create account' } },
    { wait: 600 },
  ],
};
