// Lit-specific: delete at the view-layer swap (gyral-g1r.12, ADR 0018).
import { afterEach, describe, expect, it } from 'vitest';
import { define, html, repeat, settled } from '../src/index.js';

// lit-html >= 3.3.1 leaves one comment node in the DOM for every item that repeat()
// removes (lit/lit#5010, #5298; gyral-9y6). The workspace pins lit-html 3.3.0 until
// upstream fixes it. This test fails on 3.3.1-3.3.3 and passes on 3.3.0.

interface State {
  readonly ids: readonly number[];
}
type Msg = { readonly _tag: 'Fill' } | { readonly _tag: 'Clear' };

const ROWS = 1000;

const List = define<State, Msg>('test-repeat-leak', {
  init: () => ({ ids: [] }),
  intent: {},
  update: {
    Fill: () => ({ ids: Array.from({ length: ROWS }, (_, n) => n) }),
    Clear: () => ({ ids: [] }),
  },
  view: (s) =>
    html`<ul>
      ${repeat(
        s.ids,
        (id) => id,
        (id) => html`<li>Row ${String(id)}</li>`,
      )}
    </ul>`,
});

const comments = (root: Node): number => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let count = 0;
  while (walker.nextNode() !== null) count += 1;
  return count;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('repeat() list churn (gyral-9y6)', () => {
  it('leaves no comment node behind per removed row', async () => {
    const el = new List();
    document.body.append(el);
    await settled();
    const root = el.shadowRoot;
    if (root === null) throw new Error('expected a shadow root');
    const empty = comments(root);

    el.send({ _tag: 'Fill' });
    await settled();
    expect(root.querySelectorAll('li')).toHaveLength(ROWS);

    el.send({ _tag: 'Clear' });
    await settled();
    expect(root.querySelectorAll('li')).toHaveLength(0);
    // Only Lit's own part markers remain: the same count as before the list was filled.
    expect(comments(root)).toBe(empty);
  });
});
