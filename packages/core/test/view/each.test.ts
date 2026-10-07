// view/03-lists.md "Row skipping", "Keys", "Fast paths" and
// reconciliation step 4 (moveBefore) in Chromium.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { each, html, render } from '../../src/view/index.js';
import { draw, fresh, mount, watch } from './render-helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

interface Item {
  readonly id: number;
  readonly label: string;
}

const items = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, label: `L${String(i + 1)}` }));

describe('row skipping (view/03 "Row skipping")', () => {
  it('re-renders a row only when its item or its pick changed', () => {
    const row = vi.fn(
      (r: Item, selected: boolean) => html`<li class=${selected ? 'on' : ''}>${r.label}</li>`,
    );
    const view = (list: readonly Item[], sel: number) =>
      html`<ul>
        ${each(
          list,
          (r) => r.id,
          row,
          (r) => r.id === sel,
        )}
      </ul>`;
    const el = mount();
    const list = items(5);
    render(view(list, 1), el);
    row.mockClear();
    render(view(list, 1), el);
    // Nothing commits; the development check re-evaluates all 5 rows after the commit.
    expect(row).toHaveBeenCalledTimes(5);
    row.mockClear();
    render(view(list, 3), el); // rows 1 and 3 change their pick
    expect(row).toHaveBeenCalledTimes(2 + 5);
    expect(row.mock.calls.slice(0, 2).map(([r, sel]) => [r.id, sel])).toEqual([
      [1, false],
      [3, true],
    ]);
    row.mockClear();
    const next = list.map((r) => (r.id === 5 ? { ...r, label: 'new' } : r));
    render(view(next, 3), el); // row 5 has a new item
    expect(row.mock.calls[0]?.[0]).toBe(next[4]);
    expect(row).toHaveBeenCalledTimes(1 + 5);
    expect(el.innerHTML).toBe(fresh(view(next, 3)));
  });

  it('skips rows without calling row or building template results', () => {
    let renders = 0;
    const Row = (r: Item) => {
      // eslint-disable-next-line gyral/each-row-purity -- counts row renders on purpose
      renders++;
      return html`<li>${r.label}</li>`;
    };
    const view = (list: readonly Item[]) =>
      html`<ul>
        ${each(list, (r) => r.id, Row)}
      </ul>`;
    const el = mount();
    const list = items(300);
    render(view(list), el); // creates 300, then checks 200 (development check)
    renders = 0;
    render(view(list), el); // skipped: only the development check's 200 re-evaluations
    expect(renders).toBe(200);
  });

  it('compares picks shallowly: arrays and plain objects by entries, one level', () => {
    const row = vi.fn((r: Item, p: unknown) => html`<li>${r.label}${JSON.stringify(p)}</li>`);
    const el = mount();
    const list = items(1);
    const picks: unknown[] = [[1, 'a'], [1, 'a'], { a: 1 }, { a: 1 }, { a: 2 }, [[1]], [[1]]];
    const commits: unknown[] = [];
    for (const p of picks) {
      row.mockClear();
      render(
        html`<ul>
          ${each(
            list,
            (r) => r.id,
            row,
            () => p,
          )}
        </ul>`,
        el,
      );
      if (row.mock.calls.length > 1) commits.push(p); // a commit plus the development check
    }
    expect(commits).toEqual([[1, 'a'], { a: 1 }, { a: 2 }, [[1]], [[1]]]);
  });

  it('moves skipped rows with their nodes, without re-rendering them', () => {
    const el = mount();
    const list = items(4);
    const view = (l: readonly Item[]) =>
      html`<ul>
        ${each(
          l,
          (r) => r.id,
          (r) => html`<li>${r.label}</li>`,
        )}
      </ul>`;
    render(view(list), el);
    const lis = [...el.querySelectorAll('li')];
    const changes = watch(el);
    render(view([list[3], list[1], list[2], list[0]] as Item[]), el);
    expect(changes.take().every((m) => m.type === 'childList')).toBe(true);
    expect([...el.querySelectorAll('li')]).toEqual([lis[3], lis[1], lis[2], lis[0]]);
  });
});

describe('keys (view/03 "Keys")', () => {
  it('can be the value for lists of primitives', () => {
    const view = (tags: string[]) =>
      html`<p>
        ${each(
          tags,
          (t) => t,
          (t) => html`<b>${t}</b>`,
        )}
      </p>`;
    const el = mount();
    draw(el, view(['a', 'b']));
    const b = el.querySelectorAll('b')[1];
    expect(draw(el, view(['b', 'c']))).toBe('<p><b>b</b><b>c</b></p>');
    expect(el.querySelector('b')).toBe(b);
  });

  it('are required (rule 9)', () => {
    expect(() => each([1], undefined as never, () => 'x')).toThrow(/needs a key function/);
  });

  it('must be unique: duplicates are a development error', () => {
    const view = (l: number[]) =>
      html`<p>
        ${each(
          l,
          (n) => n % 3,
          (n) => n,
        )}
      </p>`;
    expect(() => {
      render(view([1, 2, 4]), mount());
    }).toThrow(/key 1 appears twice/);
  });

  it('must be strings or numbers', () => {
    const view = html`<p>
      ${each(
        [{}],
        (o) => o as never,
        () => 'x',
      )}
    </p>`;
    expect(() => {
      render(view, mount());
    }).toThrow(/key at index 0 is an object/);
  });
});

describe('fast paths (view/03 "Fast paths")', () => {
  const view = (l: readonly Item[]) =>
    html`<table>
      <tbody>
        ${each(
          l,
          (r) => r.id,
          (r) =>
            html`<tr>
              <td>${r.label}</td>
            </tr>`,
        )}
      </tbody>
    </table>`;

  it('creates into an empty list with one fragment insertion', () => {
    const el = mount();
    render(view([]), el);
    const changes = watch(el);
    render(view(items(100)), el);
    const records = changes.take();
    expect(records).toHaveLength(1);
    expect(records[0]?.addedNodes.length).toBe(100);
  });

  it('clears with replaceChildren when the list is its parent’s only content', () => {
    const el = mount();
    render(view(items(100)), el);
    const replace = vi.spyOn(Element.prototype, 'replaceChildren');
    const changes = watch(el);
    render(view([]), el);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(changes.take()).toHaveLength(1);
    expect(el.querySelector('tbody')?.childNodes.length).toBe(0);
  });

  it('removes rows one by one when the list shares its parent', () => {
    const el = mount();
    const shared = (l: readonly Item[]) =>
      html`<ul>
        <li>first</li>
        ${each(
          l,
          (r) => r.id,
          (r) => html`<li>${r.label}</li>`,
        )}
        <li>last</li>
      </ul>`;
    render(shared(items(3)), el);
    const replace = vi.spyOn(Element.prototype, 'replaceChildren');
    expect(draw(el, shared([]))).toBe('<ul><li>first</li><li>last</li></ul>');
    expect(replace).not.toHaveBeenCalled();
  });

  it('appends only the tail when the old keys are a prefix of the new ones', () => {
    const el = mount();
    const list = items(10);
    render(view(list.slice(0, 5)), el);
    const changes = watch(el);
    render(view(list), el);
    const records = changes.take();
    expect(records).toHaveLength(1);
    expect(records[0]?.addedNodes.length).toBe(5);
    expect(records[0]?.removedNodes.length).toBe(0);
  });

  it('replaces every row at once when no key survives', () => {
    const el = mount();
    render(view(items(10)), el);
    const fresh10 = items(10).map((r) => ({ ...r, id: r.id + 100 }));
    const changes = watch(el);
    render(view(fresh10), el);
    expect(changes.take()).toHaveLength(2); // one clear, one insertion
    expect(el.innerHTML).toBe(fresh(view(fresh10)));
  });
});

describe('moves (view/03 "Reconciliation", step 4)', () => {
  const view = (l: readonly Item[]) =>
    html`<ul>
      ${each(
        l,
        (r) => r.id,
        (r) => html`<li><input value=${r.label} /></li>`,
      )}
    </ul>`;

  it.runIf('moveBefore' in Element.prototype)(
    'uses moveBefore in a document, keeping focus',
    () => {
      const el = mount();
      const list = items(5);
      render(view(list), el);
      const input = el.querySelectorAll('input')[0] as HTMLInputElement;
      input.focus();
      const move = vi.spyOn(Element.prototype, 'moveBefore' as never);
      render(view([list[1], list[2], list[3], list[4], list[0]] as Item[]), el);
      expect(move).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(input);
    },
  );

  it('uses insertBefore outside a document', () => {
    const el = document.createElement('div');
    const list = items(5);
    render(view(list), el);
    const insert = vi.spyOn(Node.prototype, 'insertBefore');
    render(view([...list].reverse()), el);
    expect(insert).toHaveBeenCalled();
    expect(el.innerHTML).toBe(fresh(view([...list].reverse())));
  });
});
