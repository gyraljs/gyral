import { css } from '@gyral/core';

export const styles = css`
  @layer component {
    :host {
      display: block;
      --accent: oklch(55% 0.18 260);
      --danger: oklch(50% 0.2 25);
      --on: oklch(45% 0.13 150);
      --line: color-mix(in oklch, currentColor 30%, transparent);
    }
    @supports (color: light-dark(black, white)) {
      :host {
        --danger: light-dark(oklch(50% 0.2 25), oklch(75% 0.15 25));
        --on: light-dark(oklch(45% 0.13 150), oklch(78% 0.14 150));
      }
    }
    * {
      box-sizing: border-box;
    }
    .mode {
      margin-block: 0 1.25rem;
      padding-block: 0.6rem;
      padding-inline: 0.9rem;
      border-inline-start: 0.35rem solid var(--line);
      border-radius: 0.35rem;
      background: color-mix(in oklch, currentColor 6%, transparent);
    }
    .mode[data-enhanced='yes'] {
      border-inline-start-color: var(--on);
    }
    .mode[data-enhanced='yes'] strong {
      color: var(--on);
    }
    form {
      display: grid;
      gap: 0.25rem;
    }
    .field {
      display: grid;
      gap: 0.25rem;
      margin-block: 0 0.5rem;
    }
    label {
      font-weight: 600;
    }
    input,
    select {
      font: inherit;
      padding-block: 0.4rem;
      padding-inline: 0.6rem;
      border: 1px solid var(--line);
      border-radius: 0.4rem;
      background: transparent;
      color: inherit;
    }
    input:focus-visible,
    select:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    input[aria-invalid='true'] {
      border-color: var(--danger);
    }
    .error {
      min-block-size: 1lh;
      color: var(--danger);
    }
    p.error:empty {
      min-block-size: 0;
      margin-block: 0;
    }
    button {
      justify-self: start;
      font: inherit;
      padding-block: 0.5rem;
      padding-inline: 1.1rem;
      border: 0;
      border-radius: 0.5rem;
      background: var(--accent);
      color: white;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.6;
    }
    .joined {
      min-block-size: 1lh;
      margin-block: 1rem 0;
    }
    h2 {
      margin-block: 1.5rem 0.5rem;
      font-size: 1.15rem;
    }
    .attendees {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .attendees li {
      padding-block: 0.2rem;
      padding-inline: 0.7rem;
      border: 1px solid var(--line);
      border-radius: 999px;
    }
    .attendees span {
      opacity: 0.75;
    }
  }
`;
