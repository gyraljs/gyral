// `copyText()` (src/clipboard.ts, gyral-dyn.22): a command over navigator.clipboard.writeText
// with typed failures, run from the reducer of a click's message, and substituted by its
// driver name (`clipboard`) in tests.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { copyText, define, html, settled, type AnyDriver } from '../src/index.js';

interface State {
  readonly log: readonly string[];
}
type Msg =
  | { readonly _tag: 'Copy' }
  | { readonly _tag: 'Copied' }
  | { readonly _tag: 'CopyFailed'; readonly reason: string };

const Invite = define<State, Msg>('test-copy-text', {
  init: () => ({ log: [] }),
  intent: { Copy: () => ({ _tag: 'Copy' }) },
  update: {
    Copy: (s) => [
      s,
      [
        copyText('https://example.test/room/42', {
          onSuccess: () => ({ _tag: 'Copied' }),
          onFailure: (e) => ({ _tag: 'CopyFailed', reason: e.reason }),
        }),
      ],
    ],
    Copied: (s) => ({ log: [...s.log, 'copied'] }),
    CopyFailed: (s, m) => ({ log: [...s.log, `failed:${m.reason}`] }),
  },
  view: (_s, i) => html`<button type="button" data-intent=${i.Copy}>Copy invite</button>`,
});

type InviteElement = HTMLElement & {
  readonly state: State;
  drivers: Readonly<Record<string, AnyDriver>>;
};

async function mount(drivers?: Readonly<Record<string, AnyDriver>>): Promise<InviteElement> {
  const el = new Invite() as InviteElement;
  if (drivers !== undefined) el.drivers = drivers;
  document.body.append(el);
  await settled();
  return el;
}

const button = (el: HTMLElement): HTMLButtonElement =>
  el.shadowRoot?.querySelector('button') as HTMLButtonElement;

/** Waits for the copy's answer (the Clipboard API is asynchronous). */
async function answered(el: InviteElement): Promise<readonly string[]> {
  await vi.waitFor(() => {
    expect(el.state.log.length).toBeGreaterThan(0);
  });
  await settled();
  return el.state.log;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('copyText()', () => {
  it('writes the text on a real click', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText');
    const el = await mount();
    await userEvent.click(button(el));
    const log = await answered(el);
    expect(write).toHaveBeenCalledWith('https://example.test/room/42');
    // The browser project grants clipboard-write (vitest.config.ts); without it: "denied".
    expect(log).toEqual(['copied']);
  });

  it('maps a refusal (no user activation, a denied permission) to reason "denied"', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new DOMException('Write permission denied.', 'NotAllowedError'),
    );
    const el = await mount();
    button(el).click();
    expect(await answered(el)).toEqual(['failed:denied']);
  });

  it('maps a missing Clipboard API (an insecure context) to reason "unavailable"', async () => {
    vi.spyOn(Navigator.prototype, 'clipboard', 'get').mockReturnValue(
      undefined as unknown as Clipboard,
    );
    const el = await mount();
    button(el).click();
    expect(await answered(el)).toEqual(['failed:unavailable']);
  });

  it('maps other errors to reason "failed"', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('boom'));
    const el = await mount();
    button(el).click();
    expect(await answered(el)).toEqual(['failed:failed']);
  });

  it('is substituted by its driver name', async () => {
    const copied: unknown[] = [];
    const el = await mount({
      clipboard: {
        name: 'clipboard',
        run: (text: unknown) => {
          copied.push(text);
        },
      },
    });
    button(el).click();
    expect(await answered(el)).toEqual(['copied']);
    expect(copied).toEqual(['https://example.test/room/42']);
  });
});
