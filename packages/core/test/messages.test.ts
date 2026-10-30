// Diagnostic codes (gyral-c5d.13, docs/references/errors.md): development prints the table's
// full text with the arguments in its placeholders, then the code and the docs URL (gyral-99d);
// production (messages.prod.test.ts) prints the code, the arguments and the docs URL.
import { describe, expect, it } from 'vitest';
import { MESSAGES } from '../src/view/messages.js';
import { codeName, DEV, docsLink, message, type MessageCode } from '../src/view/index.js';

const link = (id: string): string => ` (${id}: https://gyral.dev/errors/#${id})`;

describe.runIf(DEV)('message() in development', () => {
  it('fills placeholders in order of first appearance; a repeated name repeats its argument', () => {
    expect(message(10, 'x-cart', 'Add')).toBe(
      '<x-cart> has no update for message "Add".' + link('G0010'),
    );
    expect(message(50, 'x-cart', 'cart')).toBe(
      '<x-cart> uses store "cart" without declaring it. Add it to the spec: stores: [cart], ' +
        'so the component subscribes to its changes.' +
        link('G0050'),
    );
  });

  it('ends every message with its code and the docs URL', () => {
    for (const key of Object.keys(MESSAGES)) {
      const code = Number(key) as MessageCode;
      expect(message(code)).toMatch(
        new RegExp(`\\S \\(${codeName(code)}: https://gyral\\.dev/errors/#${codeName(code)}\\)$`),
      );
    }
  });

  it('names codes with four digits and links the docs', () => {
    expect(codeName(7)).toBe('G0007');
    expect(docsLink(62)).toBe(link('G0062'));
  });
});
