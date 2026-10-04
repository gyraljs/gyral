/** What `<gy-key-relay>` sends to its Gyral parent. */
export interface KeyOutput {
  readonly _tag: 'Key';
  readonly key: string;
}

export const isKeyOutput = (detail: unknown): detail is KeyOutput =>
  typeof detail === 'object' &&
  detail !== null &&
  (detail as Partial<KeyOutput>)._tag === 'Key' &&
  typeof (detail as Partial<KeyOutput>).key === 'string';

const words = (value: string | null): readonly string[] => (value ?? '').split(/\s+/);

/**
 * Relays `keydown` from its contents to the Gyral parent as an output (the ADR 0010 interop
 * path: any custom element may dispatch `gyral-output`). Gyral intents don't listen for
 * keydown, so this element is the intent source for keyboard navigation.
 *
 *   <gy-key-relay data-intent=${i.Key} keys="ArrowUp ArrowDown" prevent="ArrowUp ArrowDown">
 *
 * `keys` lists the `KeyboardEvent.key` values to relay; `prevent` the ones whose default
 * action (moving the caret, for arrows) is cancelled.
 */
export class KeyRelay extends HTMLElement {
  connectedCallback(): void {
    this.addEventListener('keydown', this.#onKey);
  }

  disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKey);
  }

  #onKey = (event: KeyboardEvent): void => {
    if (event.isComposing || !words(this.getAttribute('keys')).includes(event.key)) return;
    if (words(this.getAttribute('prevent')).includes(event.key)) event.preventDefault();
    const detail: KeyOutput = { _tag: 'Key', key: event.key };
    this.dispatchEvent(new CustomEvent('gyral-output', { detail, bubbles: true }));
  };
}

if (customElements.get('gy-key-relay') === undefined) {
  customElements.define('gy-key-relay', KeyRelay);
}

declare global {
  interface HTMLElementTagNameMap {
    'gy-key-relay': KeyRelay;
  }
}
