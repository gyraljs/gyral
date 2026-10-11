import { afterEach, describe, expect, it, vi } from 'vitest';
import { define, html, prop, settled, type FormControlValue } from '../src/index.js';

interface State {
  readonly value: string;
  readonly disabled: boolean;
  readonly mode: string;
}
type Msg = { readonly _tag: 'Edited'; readonly value: string };
const Control = define<State, Msg, { readonly required: boolean }>()('test-form-control', {
  props: { required: prop.boolean({ default: false }) },
  init: () => ({ value: 'initial', disabled: false, mode: '' }),
  intent: { Edited: ({ value }) => ({ _tag: 'Edited', value: value ?? '' }) },
  update: {
    Edited: (s, m) => ({ ...s, value: m.value }),
    FormReset: (s) => ({ ...s, value: 'initial' }),
    FormDisabled: (s, m) => ({ ...s, disabled: m.disabled }),
    FormStateRestore: (s, m) => ({
      ...s,
      value: typeof m.state === 'string' ? m.state : '',
      mode: m.mode,
    }),
  },
  formAssociated: {
    value: (s) => s.value,
    state: (s) => s.value,
    validity: (s, { props }) =>
      props.required && s.value === ''
        ? { flags: { valueMissing: true }, message: 'Enter a value', anchor: 'input' }
        : undefined,
  },
  states: (s) => ({ disabled: s.disabled }),
  view: (s, i) =>
    html`<label
      >Value
      <input
        value=${s.value}
        ?disabled=${s.disabled}
        data-intent=${i.Edited}
        data-intent-on="input"
    /></label>`,
});

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(disabled = false) {
  const form = document.createElement('form');
  const fieldset = document.createElement('fieldset');
  fieldset.disabled = disabled;
  const el = new Control();
  el.setAttribute('name', 'choice');
  fieldset.append(el);
  form.append(fieldset);
  document.body.append(form);
  await settled();
  return { form, fieldset, el };
}

describe('native form-associated components', () => {
  it('submits model values and responds to a native form reset', async () => {
    const { form, el } = await mount();
    expect(Control.formAssociated).toBe(true);
    expect(Array.from(form.elements)).toContain(el);
    expect(new FormData(form).get('choice')).toBe('initial');
    el.send({ _tag: 'Edited', value: 'changed' });
    await settled();
    expect(new FormData(form).get('choice')).toBe('changed');
    form.reset();
    await settled();
    expect(el.state.value).toBe('initial');
    expect(new FormData(form).get('choice')).toBe('initial');
  });

  it('mirrors effective disabled state, including a fieldset disabled before first render', async () => {
    const { form, fieldset, el } = await mount(true);
    expect(el.state.disabled).toBe(true);
    expect(el.shadowRoot?.querySelector('input')?.disabled).toBe(true);
    expect(el.matches(':state(disabled)')).toBe(true);
    expect(new FormData(form).has('choice')).toBe(false);
    fieldset.disabled = false;
    await settled();
    expect(el.state.disabled).toBe(false);
    expect(new FormData(form).get('choice')).toBe('initial');
    el.setAttribute('disabled', '');
    await settled();
    expect(el.state.disabled).toBe(true);
  });

  it('applies pure validity projections to native constraints, using updated props', async () => {
    const { form, el } = await mount();
    const validity = vi.spyOn(ElementInternals.prototype, 'setValidity');
    try {
      el.required = true;
      el.send({ _tag: 'Edited', value: '' });
      await settled();
      expect(form.checkValidity()).toBe(false);
      expect(validity).toHaveBeenLastCalledWith(
        { valueMissing: true },
        'Enter a value',
        el.shadowRoot?.querySelector('input'),
      );
      el.required = false;
      await settled();
      expect(form.checkValidity()).toBe(true);
    } finally {
      validity.mockRestore();
    }
  });

  it('routes restoration callbacks through typed reducers without rerunning init', async () => {
    const { el, form } = await mount();
    const restore = Reflect.get(el, 'formStateRestoreCallback') as (
      state: FormControlValue,
      mode: 'restore' | 'autocomplete',
    ) => void;
    restore.call(el, 'restored', 'restore');
    await settled();
    expect(el.state).toEqual({ value: 'restored', disabled: false, mode: 'restore' });
    expect(new FormData(form).get('choice')).toBe('restored');
    restore.call(el, 'autofilled', 'autocomplete');
    await settled();
    expect(el.state.mode).toBe('autocomplete');
  });

  it('supports null, File and multi-field FormData values with native name semantics', async () => {
    let submitted: FormControlValue = null;
    const Multi = define()('test-form-multi', {
      formAssociated: { value: () => submitted },
      view: () => html`<p>Multiple values</p>`,
    });
    const form = document.createElement('form');
    const el = new Multi();
    el.setAttribute('name', 'attachment');
    form.append(el);
    document.body.append(form);
    await settled();
    expect(new FormData(form).has('attachment')).toBe(false);
    submitted = new File(['content'], 'note.txt', { type: 'text/plain' });
    form.remove();
    document.body.append(form);
    await settled();
    // Reconnect alone need not render: a prop change requests a new projection below.
    const Data = define<{ readonly n: number }, { readonly _tag: 'Refresh' }>()('test-form-data', {
      init: () => ({ n: 0 }),
      update: { Refresh: (s) => ({ n: s.n + 1 }) },
      formAssociated: { value: () => submitted },
      view: () => html`<p>Data</p>`,
    });
    el.remove();
    const data = new Data();
    data.setAttribute('name', 'attachment');
    form.append(data);
    await settled();
    expect((new FormData(form).get('attachment') as File).name).toBe('note.txt');
    submitted = new FormData();
    submitted.append('a', 'one');
    submitted.append('a', 'two');
    data.send({ _tag: 'Refresh' });
    await settled();
    expect(new FormData(form).getAll('a')).toEqual(['one', 'two']);
    expect(new FormData(form).has('attachment')).toBe(false);
  });
});
