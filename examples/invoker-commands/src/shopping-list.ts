import { css, define, each, html } from '@gyral/core';

export interface State {
  readonly items: readonly string[];
  readonly next: number;
}

export type ListCommand = '--add' | '--clear';

export type Msg = { readonly _tag: 'Command'; readonly command: ListCommand };

const isListCommand = (c: string | undefined): c is ListCommand => c === '--add' || c === '--clear';

/**
 * Buttons send invoker commands to the list (gyral-czi.6): its `command` intent parses which
 * one. `show-modal` is a built-in command the browser handles with no JS at all.
 */
export const ShoppingList = define<State, Msg>()('gy-shopping-list', {
  init: () => ({ items: ['Milk', 'Bread'], next: 1 }),
  intent: {
    Command: ({ command }) =>
      isListCommand(command?.command) ? { _tag: 'Command', command: command.command } : undefined,
  },
  update: {
    Command: (s, m) => {
      switch (m.command) {
        case '--add':
          return { items: [...s.items, `Item ${String(s.next)}`], next: s.next + 1 };
        case '--clear':
          return { ...s, items: [] };
      }
    },
  },
  view: (s, i) => html`
    <menu>
      <li><button type="button" commandfor="list" command="--add">Add item</button></li>
      <li><button type="button" commandfor="list" command="--clear">Clear</button></li>
      <li><button type="button" commandfor="help" command="show-modal">Help</button></li>
    </menu>
    <section id="list" data-intent=${i.Command} data-intent-on="command" aria-labelledby="list-h">
      <h2 id="list-h">List (${s.items.length})</h2>
      <ul>
        ${each(
          s.items,
          (item) => item,
          (item) => html`<li>${item}</li>`,
        )}
      </ul>
    </section>
    <dialog id="help">
      <p>Each button sends a command to the element named by its <code>commandfor</code>.</p>
      <form method="dialog"><button>Close</button></form>
    </dialog>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      menu {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding: 0;
        list-style: none;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-shopping-list': InstanceType<typeof ShoppingList>;
  }
}
