// Panel styles: own tokens on :host (overridable from the page), light and dark.
export const panelStyles = `
@layer reset, tokens, components;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
}

@layer tokens {
  :host {
    color-scheme: light dark;
    --gd-surface: light-dark(oklch(99% 0.003 250), oklch(20% 0.012 250));
    --gd-raised: light-dark(oklch(96% 0.006 250), oklch(25% 0.014 250));
    --gd-ink: light-dark(oklch(22% 0.02 250), oklch(94% 0.01 250));
    --gd-muted: light-dark(oklch(42% 0.02 250), oklch(78% 0.015 250));
    --gd-line: light-dark(oklch(85% 0.01 250), oklch(38% 0.015 250));
    --gd-accent: light-dark(oklch(48% 0.16 280), oklch(78% 0.13 280));
    --gd-accent-ink: light-dark(oklch(99% 0 0), oklch(18% 0.02 280));
    --gd-font: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
}

@layer components {
  :host {
    position: fixed;
    inset-block-end: 0.75rem;
    inset-inline-end: 0.75rem;
    z-index: 2147483000;
    display: grid;
    justify-items: end;
    gap: 0.5rem;
    max-inline-size: min(44rem, calc(100vi - 1.5rem));
    font: 0.8125rem/1.4 var(--gd-font);
    color: var(--gd-ink);
  }
  button {
    font: inherit;
    border: 1px solid var(--gd-line);
    border-radius: 0.375rem;
    padding: 0.25rem 0.625rem;
    background: var(--gd-raised);
    color: var(--gd-ink);
    cursor: pointer;
  }
  .toggle {
    background: var(--gd-accent);
    color: var(--gd-accent-ink);
    border-color: transparent;
  }
  .count {
    font-variant-numeric: tabular-nums;
    padding-inline-start: 0.25rem;
  }
  button:focus-visible, input:focus-visible, summary:focus-visible {
    outline: 2px solid var(--gd-accent);
    outline-offset: 2px;
  }
  section {
    inline-size: 100%;
    max-block-size: min(70vb, 36rem);
    overflow: auto;
    background: var(--gd-surface);
    border: 1px solid var(--gd-line);
    border-radius: 0.5rem;
    padding: 0.75rem;
    box-shadow: 0 0.5rem 1.5rem light-dark(oklch(0% 0 0 / 0.15), oklch(0% 0 0 / 0.5));
  }
  section[hidden] { display: none; }
  /* On phones keep the page's own controls reachable above the open panel. */
  @media (max-width: 40rem) {
    section { max-block-size: 45vb; }
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    justify-content: space-between;
  }
  h2 { font-size: 1rem; margin: 0; }
  details { margin-block-start: 0.5rem; }
  summary { cursor: pointer; font-weight: 700; }
  .filters { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-block: 0.5rem; }
  fieldset { display: flex; flex-wrap: wrap; gap: 0.5rem; border: 1px solid var(--gd-line); border-radius: 0.375rem; margin: 0; padding: 0.125rem 0.5rem; }
  legend { color: var(--gd-muted); padding-inline: 0.25rem; }
  input[type='search'] { font: inherit; inline-size: 12rem; max-inline-size: 100%; }
  ol, ul { list-style: none; margin: 0; padding: 0; }
  .timeline li {
    display: grid;
    grid-template-columns: 5.5rem 5.5rem minmax(0, 1fr);
    gap: 0 0.5rem;
    padding-block: 0.25rem;
    border-block-end: 1px solid var(--gd-line);
  }
  .timeline .what, .timeline .detail { grid-column: 3; overflow-wrap: anywhere; }
  .timeline .who { grid-column: 3; grid-row: 1; overflow-wrap: anywhere; }
  .timeline .at, .timeline .kind { color: var(--gd-muted); }
  .timeline .detail { color: var(--gd-muted); }
  pre { margin: 0.25rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--gd-raised); padding: 0.375rem; border-radius: 0.25rem; }
  table { border-collapse: collapse; inline-size: 100%; margin-block-start: 0.25rem; }
  th, td { text-align: start; padding: 0.25rem 0.375rem; border-block-end: 1px solid var(--gd-line); }
  th { color: var(--gd-muted); font-weight: 600; }
}
`;
