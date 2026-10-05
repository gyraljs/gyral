import { css } from '@gyral/core';

export const styles = css`
  @layer component {
    :host {
      display: block;
      --accent: oklch(55% 0.18 260);
      --line: color-mix(in oklch, currentColor 25%, transparent);
      --empty: color-mix(in oklch, currentColor 6%, transparent);
      --ink: oklch(25% 0.03 250);
      --red: oklch(60% 0.2 25);
      --orange: oklch(72% 0.17 55);
      --yellow: oklch(86% 0.16 95);
      --green: oklch(64% 0.15 150);
      --blue: oklch(58% 0.16 255);
    }
    @supports (color: light-dark(black, white)) {
      :host {
        --ink: light-dark(oklch(25% 0.03 250), oklch(92% 0.01 250));
      }
    }
    * {
      box-sizing: border-box;
    }
    .editor {
      display: grid;
      gap: 1rem;
    }
    .tools {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      border: 0;
    }
    legend {
      margin-block-end: 0.5rem;
      font-weight: 600;
    }
    .swatch {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding-block: 0.25rem;
      padding-inline: 0.4rem 0.6rem;
      border: 1px solid var(--line);
      border-radius: 999px;
      cursor: pointer;
      text-transform: capitalize;
    }
    .swatch::before {
      content: '';
      inline-size: 1rem;
      block-size: 1rem;
      border-radius: 50%;
      border: 1px solid var(--line);
      background: var(--swatch, transparent);
    }
    .swatch:has(:checked) {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px var(--accent);
    }
    .swatch:has(:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    /* The radio stays focusable and announced; the pill is its visible face. */
    .swatch input {
      position: absolute;
      opacity: 0;
      inline-size: 1px;
      block-size: 1px;
    }
    [data-tool='ink'] {
      --swatch: var(--ink);
    }
    [data-tool='red'] {
      --swatch: var(--red);
    }
    [data-tool='orange'] {
      --swatch: var(--orange);
    }
    [data-tool='yellow'] {
      --swatch: var(--yellow);
    }
    [data-tool='green'] {
      --swatch: var(--green);
    }
    [data-tool='blue'] {
      --swatch: var(--blue);
    }
    .canvas {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 2px;
      inline-size: min(100%, 26rem);
      padding: 2px;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
    }
    .pixel {
      aspect-ratio: 1;
      min-inline-size: 0;
      padding: 0;
      border: 0;
      border-radius: 2px;
      background: var(--empty);
      cursor: crosshair;
    }
    .pixel:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
      position: relative;
    }
    [data-color='ink'] {
      background: var(--ink);
    }
    [data-color='red'] {
      background: var(--red);
    }
    [data-color='orange'] {
      background: var(--orange);
    }
    [data-color='yellow'] {
      background: var(--yellow);
    }
    [data-color='green'] {
      background: var(--green);
    }
    [data-color='blue'] {
      background: var(--blue);
    }
    /* Ghosts: what redo would bring back. */
    [data-ghost='ink'] {
      --ghost: var(--ink);
    }
    [data-ghost='red'] {
      --ghost: var(--red);
    }
    [data-ghost='orange'] {
      --ghost: var(--orange);
    }
    [data-ghost='yellow'] {
      --ghost: var(--yellow);
    }
    [data-ghost='green'] {
      --ghost: var(--green);
    }
    [data-ghost='blue'] {
      --ghost: var(--blue);
    }
    .pixel[data-ghost] {
      outline: 2px dashed var(--ghost, var(--line));
      outline-offset: -3px;
    }
    .pixel[data-color='none'][data-ghost] {
      background: color-mix(in oklch, var(--ghost, transparent) 25%, transparent);
    }
    .history {
      display: grid;
      gap: 0.75rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .actions button {
      font: inherit;
      padding-block: 0.4rem;
      padding-inline: 0.9rem;
      border: 1px solid var(--accent);
      border-radius: 0.5rem;
      background: color-mix(in oklch, var(--accent) 10%, transparent);
      color: inherit;
      cursor: pointer;
    }
    .actions button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .actions button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .timeline {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
    }
    .timeline input {
      inline-size: 100%;
    }
    @supports (accent-color: red) {
      .timeline input {
        accent-color: var(--accent);
      }
    }
    .where {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 0.75rem;
      margin: 0;
      font-variant-numeric: tabular-nums;
    }
  }
`;
