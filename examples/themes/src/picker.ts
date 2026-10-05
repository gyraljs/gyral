import { css, define, html, liveBoolean } from '@gyral/core';
import { THEMES, applyTheme, isTheme, type Theme } from './theme-driver.js';

export interface State {
  readonly theme: Theme;
}

export type Msg = { readonly _tag: 'Pick'; readonly theme: Theme };

const LABELS: Readonly<Record<Theme, string>> = {
  calm: 'Calm',
  midnight: 'Midnight',
  paper: 'Paper',
  brutalist: 'Brutalist',
};

export const Picker = define<State, Msg>('gy-theme-picker', {
  init: () => ({ theme: 'calm' }),
  intent: {
    Pick: ({ value }) => (isTheme(value) ? { _tag: 'Pick', theme: value } : undefined),
  },
  update: {
    Pick: (_s, m) => [{ theme: m.theme }, [applyTheme(m.theme)]],
  },
  view: (s, i) => html`
    <fieldset>
      <legend>Theme</legend>
      ${THEMES.map(
        (theme) =>
          html`<label>
            <input
              type="radio"
              name="theme"
              value=${theme}
              ?checked=${liveBoolean(s.theme === theme)}
              data-intent=${i.Pick}
            />
            ${LABELS[theme]}
          </label>`,
      )}
    </fieldset>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      fieldset {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0;
        padding: 0;
        border: 0;
      }
      legend {
        margin-block-end: 0.5rem;
        font-weight: 700;
      }
      label {
        position: relative;
        padding-block: 0.4rem;
        padding-inline: 0.9rem;
        border: var(--border) solid var(--line);
        border-radius: var(--radius);
        background: var(--card);
        cursor: pointer;
      }
      label:has(:checked) {
        border-color: var(--accent);
        background: var(--accent);
        color: var(--accent-ink);
      }
      label:has(:focus-visible) {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      input {
        position: absolute;
        opacity: 0;
        inline-size: 1px;
        block-size: 1px;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-theme-picker': InstanceType<typeof Picker>;
  }
}
