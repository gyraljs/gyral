import { command, defineDriver, type Command } from '@gyral/core';

const isEditable = (target: EventTarget | undefined): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

/**
 * Streams letter keys (A–Z) pressed anywhere in the document, like Cycle's
 * `fromEvent(document, 'keydown')` source. A streaming driver (ADR 0006): it emits until the
 * component disconnects. Keys typed into form fields and shortcuts with modifiers are ignored.
 */
export const keyboard = defineDriver<undefined, string>({
  name: 'keyboard',
  run: (_input, { signal, emit }) =>
    new Promise<never>((_resolve, reject) => {
      const onKey = (event: KeyboardEvent): void => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
        if (isEditable(event.composedPath()[0])) return;
        const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
        if (letter !== undefined) emit(letter);
      };
      document.addEventListener('keydown', onKey);
      signal.addEventListener(
        'abort',
        () => {
          document.removeEventListener('keydown', onKey);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    }),
});

/** Listens for letter keys for as long as the component is connected. */
export function letterKeys<M>(toMsg: (letter: string) => M): Command<M> {
  return command(keyboard, undefined, {
    onSuccess: toMsg,
    key: 'keyboard',
    concurrency: 'switch',
  });
}
