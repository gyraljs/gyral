// Public custom-element boundary only; the host frameworks are black boxes in this spike.
import { define, html, outputs, prop } from '@gyral/core';

const emit = outputs();
const strings = {
  '~standard': {
    version: 1,
    vendor: 'spike',
    validate: (value) =>
      Array.isArray(value) && value.every((v) => typeof v === 'string')
        ? { value }
        : { issues: [{ message: 'Expected string items' }] },
  },
};

define()('platform-picker', {
  props: {
    label: prop.string({ default: '' }),
    items: prop.value(strings, { default: [] }),
  },
  init: () => ({}),
  intent: { Pick: ({ value }) => ({ _tag: 'Pick', id: value }) },
  update: { Pick: (s, m) => [s, [emit({ _tag: 'Picked', id: m.id })]] },
  view: (_s, i, { props }) =>
    html` <p>${props.label}</p>
      <button type="button" value=${props.items[0]} data-intent=${i.Pick}>Pick</button>`,
});
