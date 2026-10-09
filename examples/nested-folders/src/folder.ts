import {
  child,
  css,
  define,
  each,
  emit,
  html,
  nothing,
  prop,
  type GyralElementClass,
} from '@gyral/core';

export interface State {
  /** Ids of this folder's direct children. Each child owns its own subtree. */
  readonly children: readonly string[];
  readonly next: number;
}

export interface Props {
  readonly folderId: string;
  readonly removable: boolean;
}

export type FolderOutput = { readonly _tag: 'Removed' };

export type Msg =
  | { readonly _tag: 'Add' }
  | { readonly _tag: 'Remove' }
  | { readonly _tag: 'Child'; readonly id: string; readonly out: FolderOutput };

/** Stable pastel hue per id, so a folder keeps its color across renders. */
export function hueOf(id: string): number {
  let hue = 7;
  for (let n = 0; n < id.length; n += 1) hue = (hue * 31 + id.charCodeAt(n)) % 360;
  return hue;
}

/**
 * A folder renders folders of its own kind: recursion through the custom-element tag.
 * Each folder owns the list of its direct children (no single state tree with lenses per
 * level); a child removes itself by emitting `Removed` up one level.
 * Ids are paths (`1.2.1`), so making a new one is pure.
 */
/** One child folder; its intent name comes through `pick`, so the row stays pure. */
const subfolder = (id: string, intent: string) =>
  html`<li>
    <gy-folder folder-id=${id} removable data-intent=${intent}></gy-folder>
  </li>`;

// The explicit type lets `child(() => Folder, …)` refer to the constant being defined.
export const Folder: GyralElementClass<State, Msg, Props, FolderOutput> = define<
  State,
  Msg,
  Props,
  FolderOutput
>()('gy-folder', {
  props: {
    folderId: prop.string({ required: true }), // attribute "folder-id"
    // A boolean attribute: absent on the root folder means "not removable" (found by ui:check).
    removable: prop.boolean(),
  },
  init: () => ({ children: [], next: 1 }),
  intent: {
    Add: () => ({ _tag: 'Add' }),
    Remove: () => ({ _tag: 'Remove' }),
    // Lazy source: `Folder` is still being defined here (recursion), so pass a function.
    Child: child(
      () => Folder,
      (out, el) => ({ _tag: 'Child', id: el.folderId, out }),
    ),
  },
  update: {
    Add: (s, _m, { props }) => ({
      children: [...s.children, `${props.folderId}.${String(s.next)}`],
      next: s.next + 1,
    }),
    Remove: (s) => [s, [emit({ _tag: 'Removed' })]],
    // FolderOutput has one variant (Removed); switch on m.out._tag when it grows.
    Child: (s, m) => ({ ...s, children: s.children.filter((id) => id !== m.id) }),
  },
  view: (s, i, { props }) => html`
    <details open style="--hue: ${hueOf(props.folderId)}">
      <summary>Folder ${props.folderId}</summary>
      <menu>
        <li><button type="button" data-intent=${i.Add}>Add folder</button></li>
        ${
          props.removable
            ? html`<li><button type="button" data-intent=${i.Remove}>Remove me</button></li>`
            : nothing
        }
      </menu>
      ${
        s.children.length === 0
          ? nothing
          : html`<ul>
              ${each(
                s.children,
                (id) => id,
                subfolder,
                () => i.Child,
              )}
            </ul>`
      }
    </details>
  `,
  styles: css`
    @layer component {
      :host {
        display: block;
      }
      details {
        padding: 1rem;
        border: 2px solid oklch(45% 0.08 var(--hue));
        border-radius: 0.5rem;
        background: oklch(94% 0.05 var(--hue));
      }
      @supports (color: light-dark(black, white)) {
        details {
          background: light-dark(oklch(94% 0.05 var(--hue)), oklch(30% 0.05 var(--hue)));
        }
      }
      summary {
        font-weight: 600;
        cursor: pointer;
      }
      menu {
        display: flex;
        gap: 0.5rem;
        padding: 0;
        list-style: none;
      }
      ul {
        display: grid;
        gap: 0.75rem;
        padding-inline-start: 1.5rem;
        list-style: none;
      }
    }
  `,
});

declare global {
  interface HTMLElementTagNameMap {
    'gy-folder': InstanceType<typeof Folder>;
  }
}
