// Diagnostic codes (gyral-c5d.13, docs/references/errors.md): development prints the table's
// full text with the arguments in its placeholders; production (messages.prod.test.ts) prints
// the code, the arguments and the docs URL.
import { describe, expect, it } from 'vitest';
import { codeName, DEV, docsLink, message } from '../src/view/index.js';

describe.runIf(DEV)('message() in development', () => {
  it('fills placeholders in order of first appearance; a repeated name repeats its argument', () => {
    expect(message(10, 'x-cart', 'Add')).toBe('<x-cart> has no update for message "Add".');
    expect(message(50, 'x-cart', 'cart')).toBe(
      '<x-cart> uses store "cart" without declaring it. Add it to the spec: stores: [cart] ' +
        '(ADR 0013), so the component subscribes to its changes.',
    );
  });

  it('names codes with four digits and links the docs', () => {
    expect(codeName(7)).toBe('G0007');
    expect(docsLink(62)).toBe('Gyral G0062 https://gyral.dev/errors/#G0062');
  });
});
