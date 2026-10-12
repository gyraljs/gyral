import { css } from '@gyral/core';

export const controls = css`
  @layer component {
    :host {
      display: block;
    }
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    fieldset {
      min-inline-size: 0;
      border: 1px solid currentColor;
      border-radius: 0.5rem;
    }
    button,
    input,
    select {
      font: inherit;
      color: inherit;
      background: transparent;
    }
    button {
      min-inline-size: 44px;
      min-block-size: 44px;
      padding: 0.5rem 0.75rem;
      border: 1px solid currentColor;
      border-radius: 0.4rem;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.65;
      cursor: default;
    }
    input {
      max-inline-size: 100%;
      padding: 0.5rem;
      border: 1px solid currentColor;
      border-radius: 0.3rem;
    }
    label {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.25rem;
      min-block-size: 44px;
      margin-block: 0.75rem;
    }
    select {
      min-block-size: 44px;
    }
    :is(button, input, select):focus-visible {
      outline: 3px solid currentColor;
      outline-offset: 3px;
    }
    output {
      display: block;
      margin-block: 1rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  }
`;
