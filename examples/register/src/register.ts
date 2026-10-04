import {
  css,
  define,
  fieldErrors,
  form,
  html,
  invalid,
  nothing,
  type FormFields,
  type IntentRejected,
} from '@gyral/core';
import { RegisterForm } from './schema.js';

export interface State {
  /** Text to re-fill after a rejection. Never passwords: state is serialized into the page. */
  readonly values: FormFields;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly welcome: string | undefined;
}

export type Msg = { readonly _tag: 'Register'; readonly name: string; readonly email: string };

export interface Props {
  /** Set by the server after a successful no-JS submission (Post/Redirect/Get). */
  readonly welcome: string | undefined;
}

const SECRET = new Set(['password', 'confirm']);

const refill = (values: FormFields = {}): FormFields =>
  Object.fromEntries(Object.entries(values).filter(([key]) => !SECRET.has(key)));

const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

const rejected = (s: State, m: IntentRejected): State => ({
  ...s,
  values: refill(m.values),
  errors: fieldErrors(m.issues),
});

interface FieldSpec {
  readonly name: string;
  readonly label: string;
  readonly type: string;
  readonly autocomplete: string;
  readonly minlength?: number;
}

const FIELDS: readonly FieldSpec[] = [
  { name: 'name', label: 'Name', type: 'text', autocomplete: 'username' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    autocomplete: 'new-password',
    minlength: 8,
  },
  { name: 'confirm', label: 'Repeat password', type: 'password', autocomplete: 'new-password' },
];

// aria-invalid is also rendered as a plain attribute: the server can't run invalid() (it calls
// setCustomValidity), but no-JS users still need the error announced (ADR 0008 server half).
const fieldView = (s: State, f: FieldSpec) => {
  const errors = s.errors[f.name];
  return html`<p>
    <label for=${f.name}>${f.label}</label>
    <input
      id=${f.name}
      name=${f.name}
      type=${f.type}
      autocomplete=${f.autocomplete}
      minlength=${f.minlength ?? nothing}
      required
      value=${text(s.values, f.name)}
      aria-describedby=${`${f.name}-error`}
      aria-invalid=${errors === undefined ? nothing : 'true'}
      ${invalid(errors)}
    />
    <span id=${`${f.name}-error`} class="error">${errors?.join(' ') ?? ''}</span>
  </p>`;
};

export const Register = define<State, Msg, Props>('gy-register', {
  props: { welcome: { type: String } },
  init: (props) => ({ values: {}, errors: {}, welcome: props.welcome }),
  intent: {
    Register: form(RegisterForm, (data) => ({
      _tag: 'Register',
      name: data.name,
      email: data.email,
    })),
  },
  update: {
    Register: (s, m) => ({ values: {}, errors: {}, welcome: m.name }),
    IntentRejected: rejected,
  },
  view: (s, i) =>
    s.welcome === undefined
      ? html`<form data-intent=${i.Register} action="/" method="post">
          ${FIELDS.map((f) => fieldView(s, f))}
          <button>Create account</button>
        </form>`
      : html`<p role="status">Welcome, <strong>${s.welcome}</strong>! Your account is ready.</p>`,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 260);
        --danger: light-dark(oklch(50% 0.2 25), oklch(75% 0.15 25));
      }
      p {
        display: grid;
        gap: 0.25rem;
      }
      input {
        font: inherit;
        padding-block: 0.4rem;
        padding-inline: 0.6rem;
        border: 1px solid color-mix(in oklch, currentColor 40%, transparent);
        border-radius: 0.4rem;
      }
      input:user-invalid,
      input[aria-invalid='true'] {
        border-color: var(--danger);
      }
      .error {
        color: var(--danger);
        min-block-size: 1lh;
      }
      button {
        font: inherit;
        padding-block: 0.5rem;
        padding-inline: 1rem;
        border: 0;
        border-radius: 0.5rem;
        background: var(--accent);
        color: white;
        cursor: pointer;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-register': InstanceType<typeof Register>;
  }
}
