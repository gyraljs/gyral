import { css } from '@gyral/core';

export const raceStyles = css`
  @layer component {
    :host {
      display: block;
      --accent: oklch(55% 0.18 260);
    }
    * {
      box-sizing: border-box;
    }
    .field {
      display: grid;
      gap: 0.35rem;
      margin-block: 0 1rem;
      font-weight: 600;
    }
    input {
      inline-size: 100%;
      font: inherit;
      font-size: 1.25rem;
      font-weight: 400;
      padding-block: 0.5rem;
      padding-inline: 0.75rem;
      border: 1px solid color-mix(in oklch, currentColor 40%, transparent);
      border-radius: 0.5rem;
      background: transparent;
      color: inherit;
    }
    input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .panels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
      gap: 1rem;
    }
  }
`;

export const panelStyles = css`
  @layer component {
    :host {
      display: block;
      --line: color-mix(in oklch, currentColor 25%, transparent);
      --bad: oklch(50% 0.2 25);
      --good: oklch(45% 0.13 150);
    }
    @supports (color: light-dark(black, white)) {
      :host {
        --bad: light-dark(oklch(50% 0.2 25), oklch(75% 0.15 25));
        --good: light-dark(oklch(45% 0.13 150), oklch(78% 0.14 150));
      }
    }
    * {
      box-sizing: border-box;
    }
    section {
      block-size: 100%;
      padding: 1rem;
      border: 2px solid var(--line);
      border-radius: 0.75rem;
    }
    [data-verdict='stale'] {
      border-color: var(--bad);
    }
    [data-verdict='fresh'] {
      border-color: var(--good);
    }
    h2,
    h3 {
      margin-block: 0 0.25rem;
    }
    h2 {
      font-size: 1.15rem;
    }
    h3 {
      margin-block-start: 0.75rem;
      font-size: 0.95rem;
    }
    .how {
      margin-block: 0 0.75rem;
      font-size: 0.9rem;
    }
    .verdict {
      min-block-size: 2lh;
      margin-block: 0 0.5rem;
    }
    [data-verdict='stale'] .verdict strong {
      color: var(--bad);
    }
    [data-verdict='fresh'] .verdict strong {
      color: var(--good);
    }
    .results {
      min-block-size: calc(6 * 1.6em);
      margin: 0;
      padding-inline-start: 1.25rem;
      line-height: 1.6;
    }
    .log {
      display: grid;
      gap: 0.25rem;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
    }
    .log li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 5.5rem;
      gap: 0.5rem;
      padding-block: 0.05rem;
      padding-inline: 0.5rem;
      border-radius: 0.35rem;
      background: color-mix(in oklch, currentColor 6%, transparent);
    }
    .log li > :last-child {
      text-align: end;
    }
    .log [data-status='cancelled'] {
      text-decoration: line-through;
      opacity: 0.7;
    }
    .log [data-status='arrived'] > :last-child {
      font-weight: 600;
    }
  }
`;
