import { css, define, html, liveBoolean, repeat, styleMap } from '@gyral/core';

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly done: boolean;
}

export interface State {
  readonly tasks: readonly Task[];
}

export type Msg =
  | { readonly _tag: 'Toggle'; readonly id: string; readonly done: boolean }
  | { readonly _tag: 'Reset' };

export const TEAM = ['Ada', 'Grace', 'Alan', 'Linus'] as const;

export const TASKS: readonly Task[] = [
  { id: 'copy', title: 'Write the launch post', owner: 'Ada', done: true },
  { id: 'docs', title: 'Proofread the docs', owner: 'Grace', done: true },
  { id: 'demo', title: 'Record the demo videos', owner: 'Alan', done: false },
  { id: 'ship', title: 'Publish 0.1.0', owner: 'Linus', done: false },
];

const initials = (name: string): string => name.slice(0, 2);

/** A small task board. Every colour, font, radius and shadow below is a theme token. */
export const Board = define<State, Msg>('gy-team-board', {
  init: () => ({ tasks: TASKS }),
  intent: {
    Toggle: ({ target, checked }) => {
      const id = target.getAttribute('data-id');
      return id === null ? undefined : { _tag: 'Toggle', id, done: checked === true };
    },
    Reset: () => ({ _tag: 'Reset' }),
  },
  update: {
    Toggle: (s, m) => ({
      tasks: s.tasks.map((t) => (t.id === m.id ? { ...t, done: m.done } : t)),
    }),
    Reset: () => ({ tasks: TASKS }),
  },
  view: (s, i) => {
    const done = s.tasks.filter((t) => t.done).length;
    const left = s.tasks.length - done;
    return html`
      <article>
        <header>
          <p class="kicker">Project</p>
          <h2>Launch week</h2>
          <ul class="team" aria-label="Team">
            ${TEAM.map((name) => html`<li title=${name}><abbr title=${name}>${initials(name)}</abbr></li>`)}
          </ul>
        </header>
        <div class="progress">
          <p>${done} of ${s.tasks.length} done</p>
          <div class="bar" aria-hidden="true">
            <span
              style=${styleMap({ inlineSize: `${String((done / s.tasks.length) * 100)}%` })}
            ></span>
          </div>
        </div>
        <ul class="tasks">
          ${repeat(
            s.tasks,
            (t) => t.id,
            (t) =>
              html`<li>
                <label>
                  <input
                    type="checkbox"
                    data-id=${t.id}
                    ?checked=${liveBoolean(t.done)}
                    data-intent=${i.Toggle}
                  />
                  <span class="title">${t.title}</span>
                  <span class="owner">${t.owner}</span>
                </label>
              </li>`,
          )}
        </ul>
        <footer>
          <p class="status" role="status">
            ${left === 0 ? 'All done. Ship it!' : `${String(left)} to go`}
          </p>
          <button type="button" data-intent=${i.Reset}>Reset</button>
        </footer>
      </article>
    `;
  },
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      * {
        box-sizing: border-box;
      }
      article {
        display: grid;
        gap: var(--space);
        padding: calc(var(--space) * 1.5);
        border: var(--border) solid var(--line);
        border-radius: var(--radius);
        background: var(--card);
        color: var(--ink);
        box-shadow: var(--shadow);
        font-family: var(--font-body);
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: 0.25rem var(--space);
      }
      .kicker {
        grid-column: 1;
        margin: 0;
        color: var(--muted);
        font-size: 0.85rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h2 {
        grid-column: 1;
        margin: 0;
        font-family: var(--font-display);
        font-weight: var(--display-weight);
        text-transform: var(--display-case);
        font-size: 1.6rem;
      }
      .team {
        grid-column: 2;
        grid-row: 1 / span 2;
        display: flex;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .team li {
        display: grid;
        place-items: center;
        inline-size: 2.25rem;
        block-size: 2.25rem;
        margin-inline-start: -0.5rem;
        border: var(--border) solid var(--card);
        border-radius: 50%;
        background: var(--accent);
        color: var(--accent-ink);
        font-size: 0.8rem;
        font-weight: 700;
      }
      abbr {
        text-decoration: none;
      }
      .progress {
        display: grid;
        gap: 0.35rem;
        color: var(--muted);
      }
      .progress p {
        margin: 0;
      }
      .bar {
        block-size: 0.75rem;
        border: var(--border) solid var(--line);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .bar span {
        display: block;
        block-size: 100%;
        background: var(--good);
        transition: inline-size 0.3s ease;
      }
      @media (prefers-reduced-motion: reduce) {
        .bar span {
          transition: none;
        }
      }
      @supports (accent-color: red) {
        input {
          accent-color: var(--accent);
        }
      }
      .tasks {
        display: grid;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .tasks label {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.75rem;
        padding-block: 0.6rem;
        padding-inline: 0.8rem;
        border: var(--border) solid var(--line);
        border-radius: var(--radius);
        cursor: pointer;
      }
      .tasks label:has(:checked) .title {
        color: var(--muted);
        text-decoration: line-through;
      }
      .owner {
        color: var(--muted);
        font-size: 0.85rem;
      }
      input {
        inline-size: 1.15rem;
        block-size: 1.15rem;
        margin: 0;
      }
      input:focus-visible,
      button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space);
      }
      .status {
        margin: 0;
        color: var(--good);
        font-weight: 700;
      }
      button {
        font: inherit;
        padding-block: 0.5rem;
        padding-inline: 1.1rem;
        border: var(--border) solid var(--accent);
        border-radius: var(--radius);
        background: var(--accent);
        color: var(--accent-ink);
        box-shadow: var(--shadow);
        cursor: pointer;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-team-board': InstanceType<typeof Board>;
  }
}
