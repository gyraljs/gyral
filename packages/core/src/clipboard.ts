// `copyText()` (gyral-dyn.22): writing to the clipboard from the model. A command over
// `navigator.clipboard.writeText`, whose driver is named `clipboard` so tests and apps can
// substitute it (`el.drivers`, `provideDrivers`). Its own module: apps that don't copy don't
// bundle it.
import { command, type Command, type Driver } from './command.js';

/**
 * Why a copy failed. `unavailable`: no Clipboard API (an insecure context, http:// on a host
 * other than localhost). `denied`: the browser refused (no user activation, or a permission or
 * permissions policy said no). `failed`: anything else. `cause` is what the browser threw.
 */
export interface ClipboardError {
  readonly _tag: 'ClipboardError';
  readonly reason: 'unavailable' | 'denied' | 'failed';
  readonly cause: unknown;
}

const UNAVAILABLE = 'The Clipboard API needs a secure context (https:// or localhost).';

const reasonOf = (cause: unknown): ClipboardError['reason'] =>
  cause instanceof DOMException && cause.name === 'NotAllowedError'
    ? 'denied'
    : cause instanceof Error && cause.message === UNAVAILABLE
      ? 'unavailable'
      : 'failed';

/** The clipboard driver: writes its input as text. */
export const clipboard: Driver<string, unknown, ClipboardError> = {
  name: 'clipboard',
  run: (text) => {
    // Absent outside secure contexts. Typed as always present, so read it as optional.
    const api = (navigator as { readonly clipboard?: Clipboard }).clipboard;
    if (api === undefined) throw new Error(UNAVAILABLE);
    return api.writeText(text);
  },
  toError: (cause) => ({ _tag: 'ClipboardError', reason: reasonOf(cause), cause }),
};

export interface CopyTextHandlers<MS, MF> {
  /** The message once the text is on the clipboard. */
  readonly onSuccess?: () => MS | undefined;
  /** The message when it isn't. If omitted, failures are logged and dropped. */
  readonly onFailure?: (error: ClipboardError) => MF | undefined;
}

/**
 * A command that puts `text` on the clipboard. Browsers allow it only in a secure context and
 * during a user activation, so return it from the reducer of the message a click parsed (a
 * synchronous parser: the command then starts while the click is being handled):
 *
 *   CopyInvite: (s) => [s, [copyText(s.inviteUrl, {
 *     onSuccess: () => ({ _tag: 'Copied' }),
 *     onFailure: (e) => ({ _tag: 'CopyFailed', reason: e.reason }),
 *   })]]
 */
export function copyText<MS = never, MF = never>(
  text: string,
  handlers: CopyTextHandlers<MS, MF> = {},
): Command<MS | MF> {
  const { onSuccess, onFailure } = handlers;
  return command<string, unknown, ClipboardError, MS, MF>(clipboard, text, {
    onSuccess: () => onSuccess?.(),
    ...(onFailure === undefined ? {} : { onFailure }),
  });
}
