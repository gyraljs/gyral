import { css, define, html, nothing, repeat } from '@gyral/core';
import type { HttpError } from '@gyral/http';
import { debounce } from '@gyral/time';
import { searchRepos, type Repo } from './github.js';

export type Results =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Searching' }
  | { readonly _tag: 'Found'; readonly repos: readonly Repo[] }
  | { readonly _tag: 'Failed'; readonly message: string };

export interface State {
  readonly query: string;
  readonly results: Results;
}

export type Msg =
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Search'; readonly query: string }
  | { readonly _tag: 'Found'; readonly query: string; readonly repos: readonly Repo[] }
  | { readonly _tag: 'SearchFailed'; readonly query: string; readonly error: HttpError };

export const DEBOUNCE_MS = 500;

const describeError = (error: HttpError): string =>
  error._tag === 'HttpStatusError' && error.status === 403
    ? 'GitHub rate limit reached. Try again in a minute.'
    : `Search failed (${error._tag}).`;

export const GithubSearch = define<State, Msg>('gy-github-search', {
  init: () => ({ query: '', results: { _tag: 'Idle' } }),
  intent: {
    Typed: ({ value }) => ({ _tag: 'Typed', query: value ?? '' }),
    Search: ({ formData }) => {
      const query = formData?.get('q');
      return typeof query === 'string' ? { _tag: 'Search', query } : undefined;
    },
  },
  update: {
    Typed: (s, m) => [
      { ...s, query: m.query },
      // Each keystroke cancels the pending timer; replaces Cycle's Time.debounce(500).
      [debounce<Msg>(DEBOUNCE_MS, { _tag: 'Search', query: m.query })],
    ],
    Search: (s, m) => {
      const query = m.query.trim();
      if (query === '') return { query: m.query, results: { _tag: 'Idle' } };
      return [
        { query: m.query, results: { _tag: 'Searching' } },
        [
          searchRepos<Msg>(
            query,
            (repos) => ({ _tag: 'Found', query: m.query, repos }),
            (error) => ({ _tag: 'SearchFailed', query: m.query, error }),
          ),
        ],
      ];
    },
    Found: (s, m) =>
      m.query === s.query ? { ...s, results: { _tag: 'Found', repos: m.repos } } : s,
    SearchFailed: (s, m) =>
      m.query === s.query
        ? { ...s, results: { _tag: 'Failed', message: describeError(m.error) } }
        : s,
  },
  view: (s, i) => html`
    <search>
      <form data-intent=${i.Search}>
        <label for="q">Repository name</label>
        <input
          id="q"
          name="q"
          type="search"
          autocomplete="off"
          spellcheck="false"
          .value=${s.query}
          data-intent=${i.Typed}
        />
      </form>
    </search>
    ${status(s.results)}
    ${
      s.results._tag === 'Found'
        ? html`<ol>
            ${repeat(s.results.repos, (r) => r.id, repoItem)}
          </ol>`
        : nothing
    }
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
        container-type: inline-size;
        --accent: oklch(55% 0.18 260);
        --muted: color-mix(in oklch, currentColor 60%, transparent);
      }
      form {
        display: grid;
        gap: 0.25rem;
      }
      input {
        font: inherit;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--muted);
        border-radius: 0.5rem;
        background: transparent;
        color: inherit;
      }
      input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      output,
      [role='alert'] {
        display: block;
        margin-block: 1rem;
        color: var(--muted);
      }
      ol {
        list-style: none;
        padding: 0;
        display: grid;
        gap: 0.75rem;
      }
      @container (inline-size > 40rem) {
        ol {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      article {
        padding: 0.75rem 1rem;
        border: 1px solid color-mix(in oklch, var(--accent) 30%, transparent);
        border-radius: 0.75rem;
      }
      h2 {
        font-size: 1rem;
        margin: 0;
      }
      @supports (text-wrap: balance) {
        h2 {
          text-wrap: balance;
        }
      }
      a {
        color: var(--accent);
      }
      p {
        margin-block: 0.5rem 0;
      }
      @supports (text-wrap: pretty) {
        p {
          text-wrap: pretty;
        }
      }
    }
  `,
});

function status(results: Results) {
  switch (results._tag) {
    case 'Idle':
      return html`<output for="q">Type to search.</output>`;
    case 'Searching':
      return html`<output for="q" aria-busy="true">Searching…</output>`;
    case 'Found':
      return html`<output for="q">${String(results.repos.length)} repositories</output>`;
    case 'Failed':
      return html`<p role="alert">${results.message}</p>`;
  }
}

function repoItem(repo: Repo) {
  return html`<li>
    <article>
      <h2><a href=${repo.html_url}>${repo.full_name}</a></h2>
      ${repo.description === null ? nothing : html`<p>${repo.description}</p>`}
      <p><data value=${repo.stargazers_count}>★ ${repo.stargazers_count.toLocaleString()}</data></p>
    </article>
  </li>`;
}

declare global {
  interface HTMLElementTagNameMap {
    'gy-github-search': InstanceType<typeof GithubSearch>;
  }
}
