import {
  define,
  each,
  field,
  fieldErrors,
  form,
  html,
  invalid,
  nothing,
  prop,
  type FormFields,
  type IntentRejected,
} from '@gyral/core';
import { submitForm } from '@gyral/http';
import * as v from 'valibot';
import { LIVE_FIELDS, RsvpForm, type Attendee } from './schema.js';
import { styles } from './styles.js';

export interface Props {
  /** Who is coming, from the server. */
  readonly attendees: readonly Attendee[];
  /** Set by the server after a no-JS submission (Post/Redirect/Get). */
  readonly joined: string | undefined;
}

export interface State {
  readonly values: FormFields;
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly attendees: readonly Attendee[];
  readonly joined: string | undefined;
  /** The RSVP being sent while the JS-path request is in flight. */
  readonly pending: Attendee | undefined;
  /** JavaScript is running here: false in the server render and until hydration. */
  readonly enhanced: boolean;
  /** Replies sent from this page with JavaScript; a new one gets a fresh, empty form. */
  readonly sent: number;
}

export type Msg =
  | { readonly _tag: 'Join'; readonly attendee: Attendee; readonly form: FormData }
  | { readonly _tag: 'Joined' }
  | { readonly _tag: 'Failed' }
  /** One field passed its check while typing: clear its error. */
  | { readonly _tag: 'Checked'; readonly name: string };

const text = (values: FormFields, key: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : '';
};

function rejected(s: State, m: IntentRejected): State {
  // A check while typing only speaks for its own field; a submission speaks for all of them.
  if (m.intent === 'Checked') return { ...s, errors: { ...s.errors, ...fieldErrors(m.issues) } };
  return {
    ...s,
    values: m.values ?? s.values,
    errors: fieldErrors(m.issues),
    pending: undefined,
  };
}

const withoutKey = (errors: State['errors'], key: string): State['errors'] =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key));

const textField = (
  s: State,
  checked: string,
  f: { name: string; label: string; type: string; autocomplete: string },
) => {
  const errors = s.errors[f.name];
  return html`<p class="field">
    <label for=${f.name}>${f.label}</label>
    <input
      id=${f.name}
      name=${f.name}
      type=${f.type}
      autocomplete=${f.autocomplete}
      required
      value=${text(s.values, f.name)}
      aria-describedby=${`${f.name}-error`}
      ${invalid(errors)}
      data-intent=${checked}
      data-intent-on="input"
    />
    <span id=${`${f.name}-error`} class="error">${errors?.join(' ') ?? ''}</span>
  </p>`;
};

/** The form, as a list row: it reads only what `pick` passes it (view/03-lists.md). */
const rsvpForm = (_sent: number, { s, join, checked }: FormArgs) =>
  html`<form data-intent=${join} action="/" method="post">
    ${textField(s, checked, { name: 'name', label: 'Name', type: 'text', autocomplete: 'name' })}
    ${textField(s, checked, { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' })}
    <p class="field">
      <label for="guests">Bringing</label>
      <select id="guests" name="guests">
        ${['0', '1', '2', '3'].map(
          (n) =>
            html`<option value=${n} ?selected=${text(s.values, 'guests') === n}>
              ${n === '0' ? 'Just me' : `+${n}`}
            </option>`,
        )}
      </select>
    </p>
    <p class="error" role="alert">${s.errors['']?.join(' ') ?? ''}</p>
    <button ?disabled=${s.pending !== undefined}>
      ${s.pending === undefined ? 'Count me in' : 'Sending…'}
    </button>
  </form>`;

interface FormArgs {
  readonly s: State;
  readonly join: string;
  readonly checked: string;
}

/**
 * The attendees prop's check. Declared once and passed by name, so production builds, which never
 * check property sets, drop it (view/05-element.md "When props are validated").
 */
const Attendees = v.array(v.object({ name: v.string(), guests: v.number() }));

export const Rsvp = define<State, Msg, Props>()('gy-rsvp', {
  props: {
    attendees: prop.value(Attendees, {
      default: [],
    }),
    joined: prop.string(),
  },
  init: (props) => ({
    values: {},
    errors: {},
    attendees: props.attendees,
    joined: props.joined,
    pending: undefined,
    enhanced: false,
    sent: 0,
  }),
  intent: {
    Join: form(RsvpForm, (data, raw) => ({
      _tag: 'Join',
      attendee: { name: data.name, guests: data.guests },
      form: raw,
    })),
    Checked: (input) => {
      const name = input.target.getAttribute('name') ?? '';
      const schema = LIVE_FIELDS[name];
      return schema === undefined
        ? undefined
        : field(schema, () => ({ _tag: 'Checked' as const, name }))(input);
    },
  },
  update: {
    // Valid here; the server still decides (it knows who is already on the list).
    Join: (s, m) => [
      { ...s, errors: {}, pending: m.attendee },
      [
        submitForm('/', m.form, {
          onSuccess: () => ({ _tag: 'Joined' }),
          onFailure: () => ({ _tag: 'Failed' }),
        }),
      ],
    ],
    Joined: (s) =>
      s.pending === undefined
        ? s
        : {
            ...s,
            values: {},
            errors: {},
            attendees: [...s.attendees, s.pending],
            joined: s.pending.name,
            pending: undefined,
            sent: s.sent + 1,
          },
    Failed: (s) => ({
      ...s,
      errors: { '': ['Something went wrong. Please try again.'] },
      pending: undefined,
    }),
    Checked: (s, m) => ({ ...s, errors: withoutKey(s.errors, m.name) }),
    IntentRejected: rejected,
    // Progressive enhancement (ADR 0012 addendum): the same markup, now driven by JS.
    Hydrated: (s) => ({ ...s, enhanced: true }),
  },
  view: (s, i) => html`
    <p class="mode" data-enhanced=${s.enhanced ? 'yes' : 'no'}>
      <strong>JavaScript ${s.enhanced ? 'on' : 'off'}.</strong>
      ${
        s.enhanced
          ? 'Fields are checked as you type and the form sends without reloading the page.'
          : 'The form posts to the server, which checks it and sends a new page.'
      }
    </p>
    ${
      // Keyed by the number of replies sent: a new reply gets a fresh form element.
      each(
        [s.sent],
        (n) => n,
        rsvpForm,
        () => ({ s, join: i.Join, checked: i.Checked }),
      )
    }
    <p class="joined" role="status">
      ${s.joined === undefined ? '' : html`You're on the list, <strong>${s.joined}</strong>!`}
    </p>
    <h2>Who's coming (${s.attendees.reduce((n, a) => n + 1 + a.guests, 0)})</h2>
    <ul class="attendees">
      ${s.attendees.map(
        (a) => html`<li>${a.name}${a.guests > 0 ? html` <span>+${a.guests}</span>` : nothing}</li>`,
      )}
    </ul>
  `,
  styles,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-rsvp': InstanceType<typeof Rsvp>;
  }
}
