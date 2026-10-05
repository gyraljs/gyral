import { define, html, nothing, type Next, type PropsChanged } from '@gyral/core';
import { latency, search, type Results } from './search.js';
import { panelStyles } from './styles.js';

/**
 * `naive`: every keystroke's request runs to completion and whichever answers last wins, as
 * with a plain fetch in an input handler. `switch`: a new request cancels the one in flight.
 */
export type Mode = 'naive' | 'switch';

export interface Props {
  readonly query: string;
  readonly mode: Mode;
}

export interface Request {
  readonly query: string;
  readonly ms: number;
  readonly status: 'pending' | 'arrived' | 'cancelled';
}

export interface State {
  readonly results: Results | undefined;
  /** The newest requests first, for the request log. */
  readonly requests: readonly Request[];
}

export type Msg = { readonly _tag: 'Found'; readonly results: Results };

const LOG_SIZE = 4;

const concurrencyOf = (mode: Mode) => (mode === 'naive' ? 'merge' : 'switch');

function typed(s: State, m: PropsChanged<Props>): Next<State, Msg> {
  const { query, mode } = m.props;
  if (query === m.prev.query) return s;
  // Under switch the runtime cancels the request in flight; the log shows that.
  const earlier = s.requests.map((r) =>
    mode === 'switch' && r.status === 'pending' ? { ...r, status: 'cancelled' as const } : r,
  );
  const requests =
    query.trim() === ''
      ? earlier
      : [{ query, ms: latency(query), status: 'pending' as const }, ...earlier].slice(0, LOG_SIZE);
  return [
    { ...s, requests },
    [search<Msg>(query, concurrencyOf(mode), (results) => ({ _tag: 'Found', results }))],
  ];
}

/** Whatever arrives is shown: no "is this still the latest query?" check in either panel. */
function found(s: State, results: Results): State {
  const i = s.requests.findIndex((r) => r.query === results.query && r.status === 'pending');
  const requests = s.requests.map((r, n) => (n === i ? { ...r, status: 'arrived' as const } : r));
  return { results: results.query.trim() === '' ? undefined : results, requests };
}

export const Panel = define<State, Msg, Props>('gy-search-panel', {
  props: {
    query: { type: String, default: '' },
    mode: { type: String, default: 'naive' },
  },
  init: () => ({ results: undefined, requests: [] }),
  intent: {},
  update: {
    Found: (s, m) => found(s, m.results),
    PropsChanged: typed,
  },
  view: (s, _i, { props }) => {
    const { results } = s;
    const stale = results !== undefined && results.query !== props.query;
    const verdict = results === undefined ? 'idle' : stale ? 'stale' : 'fresh';
    return html`
      <section aria-labelledby="title" data-verdict=${verdict}>
        <h2 id="title">${props.mode === 'naive' ? 'Without cancellation' : 'With switch'}</h2>
        <p class="how"><code>concurrency: '${concurrencyOf(props.mode)}'</code></p>
        <p class="verdict" aria-live="polite">
          ${
            results === undefined
              ? 'Type to search.'
              : stale
                ? html`<strong>Stale!</strong> Showing “${results.query}”, but you typed
                    “${props.query}”.`
                : html`<strong>Up to date.</strong> Showing “${results.query}”.`
          }
        </p>
        <ul class="results" aria-label="Results">
          ${results?.items.map((item) => html`<li>${item}</li>`) ?? nothing}
          ${results !== undefined && results.items.length === 0 ? html`<li>No matches</li>` : nothing}
        </ul>
        <h3>Requests</h3>
        <ol class="log">
          ${s.requests.map(
            (r) =>
              html`<li data-status=${r.status}>
                <code>“${r.query}”</code><span>${r.ms} ms</span><span>${r.status}</span>
              </li>`,
          )}
        </ol>
      </section>
    `;
  },
  styles: panelStyles,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-search-panel': InstanceType<typeof Panel>;
  }
}
