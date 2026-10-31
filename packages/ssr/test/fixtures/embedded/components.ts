// Components of the embedded-protocol fixture (ADR 0034), modeled on gyral-rs's example app:
// a prop, component CSS, a shared store, a native form with a schema, a time zone and a
// component that throws. The bundle (server.ts) and the test (for styleHashes()) import them.
import {
  define,
  defineForm,
  defineStore,
  form,
  html,
  prop,
  send,
  type FieldIssue,
  type StandardSchemaV1,
} from '@gyral/core';

export const documentCss = `body { margin: 0; font: 1rem/1.6 system-ui, sans-serif; }
main { max-inline-size: 72ch; margin-inline: auto; padding: 1rem; }`;

const controlsCss = `:host { display: block; }
button { font: inherit; min-block-size: 44px; }`;

define()('embedded-greeting', {
  props: { name: prop.string({ default: 'friend' }) },
  view: (_state, _intent, { props }) => html`<h1>Hello, ${props.name}</h1>`,
});

define<{ readonly count: number }, { readonly _tag: 'Increment' }>()('embedded-counter', {
  styles: controlsCss,
  init: () => ({ count: 0 }),
  intent: { Increment: true },
  update: { Increment: (state) => ({ count: state.count + 1 }) },
  view: (state, intent) => html`
    <p>Count: <output>${state.count}</output></p>
    <button type="button" data-intent=${intent.Increment}>Increment</button>
  `,
});

interface Visit {
  readonly name: string;
  readonly count: number;
}
type VisitMsg = { readonly _tag: 'Increment' } | { readonly _tag: 'Rename'; readonly name: string };
export const VisitStore = defineStore<Visit, VisitMsg>('embedded-visit', {
  init: () => ({ name: 'unseeded', count: 0 }),
  update: {
    Increment: (state) => ({ ...state, count: state.count + 1 }),
    Rename: (state, msg) => ({ ...state, name: msg.name }),
  },
});

define<Record<string, never>, { readonly _tag: 'AddVisit' }>()('embedded-store-card', {
  styles: controlsCss,
  stores: [VisitStore],
  init: () => ({}),
  intent: { AddVisit: true },
  update: { AddVisit: (state) => [state, [send(VisitStore, { _tag: 'Increment' })]] },
  view: (_state, intent, { read }) => html`
    <p>Shared name: <strong>${read(VisitStore).name}</strong></p>
    <p>Visits: <output>${read(VisitStore).count}</output></p>
    <button type="button" data-intent=${intent.AddVisit}>Add visit</button>
  `,
});

// A synchronous Standard Schema, as gyral-rs's example writes it.
const nameSchema: StandardSchemaV1<unknown, { readonly name: string }> = {
  '~standard': {
    version: 1,
    vendor: 'gyral-embedded-fixture',
    validate: (raw) => {
      const value = typeof raw === 'object' && raw !== null ? (raw as { name?: unknown }) : {};
      const name = typeof value.name === 'string' ? value.name.trim() : '';
      return name.length >= 2
        ? { value: { name } }
        : { issues: [{ message: 'Use at least 2 characters.', path: ['name'] }] };
    },
  },
};
const NameForm = defineForm(nameSchema, { secret: ['private_note'] });

type NameState =
  | { readonly _tag: 'Editing'; readonly name: string }
  | { readonly _tag: 'Rejected'; readonly name: string; readonly issues: readonly FieldIssue[] };
type NameMsg = { readonly _tag: 'SaveName'; readonly name: string };
define<NameState, NameMsg, { readonly name: string }>()('embedded-name-form', {
  props: { name: prop.string({ default: 'friend' }) },
  styles: controlsCss,
  init: (props) => ({ _tag: 'Editing', name: props.name }),
  intent: { SaveName: form(NameForm, (data) => ({ _tag: 'SaveName', name: data.name })) },
  update: {
    SaveName: (_state, msg) => ({ _tag: 'Editing', name: msg.name }),
    IntentRejected: (state, msg) => ({ _tag: 'Rejected', name: state.name, issues: msg.issues }),
  },
  view: (state, intent) => html`
    <form method="get" action="/" data-intent=${intent.SaveName}>
      <label for="name">Your name</label>
      <input id="name" name="name" autocomplete="name" value=${state.name} />
      <label for="private-note">Private note</label>
      <input id="private-note" name="private_note" type="password" autocomplete="off" />
      <button type="submit">Save name</button>
      ${state._tag === 'Rejected'
        ? html`<p role="alert">${state.issues.map((issue) => issue.message).join(' ')}</p>`
        : ''}
    </form>
  `,
});

interface TimeProps {
  readonly instant: string;
  readonly zone: string;
}
define<{ readonly formatted: string }, never, TimeProps>()('embedded-time-card', {
  props: {
    instant: prop.string({ default: '2026-11-01T06:30:00Z' }),
    zone: prop.string({ default: 'America/New_York' }),
  },
  init: (props) => ({
    formatted: new Intl.DateTimeFormat('en-US', {
      timeZone: props.zone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(props.instant)),
  }),
  view: (state, _intent, { props }) =>
    html`<p>Local time: <time datetime=${props.instant}>${state.formatted}</time></p>`,
});

// The host's opaque-error path: rendered with onError: 'throw', the render rejects.
define()('embedded-broken-card', {
  view: () => {
    throw new Error('synthetic-private-render-diagnostic');
  },
});
