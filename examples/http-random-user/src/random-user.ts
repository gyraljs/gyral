import { css, define, html, randomInt } from '@gyral/core';
import type { HttpError } from '@gyral/http';
import { fetchUser, USER_COUNT, type User } from './users.js';

export type State =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading'; readonly id: number }
  | { readonly _tag: 'Loaded'; readonly user: User }
  | { readonly _tag: 'Failed'; readonly message: string };

export type Msg =
  | { readonly _tag: 'GetRandom' }
  | { readonly _tag: 'Picked'; readonly id: number }
  | { readonly _tag: 'UserLoaded'; readonly user: User }
  | { readonly _tag: 'UserFailed'; readonly error: HttpError };

const describeError = (error: HttpError): string => {
  switch (error._tag) {
    case 'HttpStatusError':
      return `The server answered ${String(error.status)} ${error.statusText}.`;
    case 'HttpNetworkError':
      return 'Could not reach the server. Check your connection.';
    case 'HttpDecodeError':
      return 'The server sent a user we could not read.';
  }
};

export const RandomUser = define<State, Msg>('gy-random-user', {
  init: () => ({ _tag: 'Idle' }),
  intent: {
    GetRandom: () => ({ _tag: 'GetRandom' }),
  },
  update: {
    // Randomness is an effect (gyral-czi.10): ask the random driver, so tests can fix it.
    // Clicks while loading are ignored: any in-flight answer is "a random user".
    GetRandom: (s) =>
      s._tag === 'Loading'
        ? s
        : [s, [randomInt<Msg>(1, USER_COUNT, (id) => ({ _tag: 'Picked', id }))]],
    Picked: (_s, m) => [
      { _tag: 'Loading', id: m.id },
      [
        fetchUser<Msg>(
          m.id,
          (user) => ({ _tag: 'UserLoaded', user }),
          (error) => ({ _tag: 'UserFailed', error }),
        ),
      ],
    ],
    UserLoaded: (_s, m) => ({ _tag: 'Loaded', user: m.user }),
    UserFailed: (_s, m) => ({ _tag: 'Failed', message: describeError(m.error) }),
  },
  // Exposed to CSS as :state(loading) / :state(failed), on this host and for page styles.
  states: (s) => ({ loading: s._tag === 'Loading', failed: s._tag === 'Failed' }),
  view: (s, i) => html`
    <button type="button" data-intent=${i.GetRandom} aria-busy=${s._tag === 'Loading'}>
      Get random user
    </button>
    ${body(s)}
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        --accent: oklch(55% 0.18 220);
        --muted: color-mix(in oklch, currentColor 60%, transparent);
      }
      button {
        font: inherit;
        padding-block: 0.5rem;
        padding-inline: 1rem;
        border: 1px solid var(--accent);
        border-radius: 0.5rem;
        background: oklch(from var(--accent) l c h / 0.1);
        color: inherit;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      :host(:state(loading)) button {
        cursor: progress;
        opacity: 0.7;
      }
      article {
        margin-block-start: 1.5rem;
        padding: 1rem 1.25rem;
        border: 1px solid color-mix(in oklch, var(--accent) 30%, transparent);
        border-radius: 0.75rem;
      }
      h2 {
        margin: 0 0 0.75rem;
        text-wrap: balance;
      }
      dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.25rem 1rem;
        margin: 0;
      }
      dt {
        color: var(--muted);
      }
      dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      a {
        color: var(--accent);
      }
      p {
        margin-block-start: 1.5rem;
        color: var(--muted);
      }
    }
  `,
});

function body(s: State) {
  switch (s._tag) {
    case 'Idle':
      return html`<p role="status">Press the button to meet someone.</p>`;
    case 'Loading':
      return html`<p role="status">Loading user ${s.id}…</p>`;
    case 'Failed':
      return html`<p role="alert">${s.message}</p>`;
    case 'Loaded':
      return userCard(s.user);
  }
}

function userCard(user: User) {
  return html`<article aria-labelledby="user-name">
    <h2 id="user-name">${user.name}</h2>
    <dl>
      <dt>Email</dt>
      <dd><a href=${`mailto:${user.email}`}>${user.email}</a></dd>
      <dt>Phone</dt>
      <dd><a href=${`tel:${user.phone}`}>${user.phone}</a></dd>
      <dt>Website</dt>
      <dd><a href=${`https://${user.website}`} rel="noopener">${user.website}</a></dd>
      <dt>Company</dt>
      <dd>${user.company.name}</dd>
    </dl>
  </article>`;
}

declare global {
  interface HTMLElementTagNameMap {
    'gy-random-user': InstanceType<typeof RandomUser>;
  }
}
