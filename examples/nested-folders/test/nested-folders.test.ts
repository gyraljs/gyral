import { afterEach, describe, expect, it } from 'vitest';
import { settled } from '@gyral/core';
import { run, step } from '@gyral/testing';
import { Folder } from '../src/folder.js';

type FolderEl = InstanceType<typeof Folder>;

afterEach(() => {
  document.body.replaceChildren();
});

describe('pure', () => {
  it('makes path ids and removes a child by id', () => {
    const props = { folderId: '1', removable: false };
    const { state } = run(
      Folder.spec,
      [{ _tag: 'Add' }, { _tag: 'Add' }, { _tag: 'Child', id: '1.1', out: { _tag: 'Removed' } }],
      { props },
    );
    expect(state).toEqual({ children: ['1.2'], next: 3 });
  });

  it('Remove only reports up', () => {
    const props = { folderId: '1.1', removable: true };
    const { state, commands } = step(
      Folder.spec,
      { children: [], next: 1 },
      { _tag: 'Remove' },
      props,
    );
    expect(state.children).toEqual([]);
    expect(commands.map((c) => c.input)).toEqual([{ _tag: 'Removed' }]);
  });
});

describe('in the browser', () => {
  const kids = (el: FolderEl) => [...(el.shadowRoot?.querySelectorAll('gy-folder') ?? [])];
  const kid = (el: FolderEl, n: number) => {
    const found = kids(el)[n];
    if (found === undefined) throw new Error(`no child ${String(n)} in ${el.folderId}`);
    return found;
  };
  const press = async (el: FolderEl, label: string) => {
    const button = [...(el.shadowRoot?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === label,
    );
    if (button === undefined) throw new Error(`no "${label}" in ${el.folderId}`);
    button.click();
    await settled();
  };

  async function mount() {
    const root = document.createElement('gy-folder');
    root.setAttribute('folder-id', '1');
    document.body.append(root);
    await settled();
    return root;
  }

  it('the root folder cannot remove itself', async () => {
    const root = await mount();
    const labels = [...(root.shadowRoot?.querySelectorAll('button') ?? [])].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(['Add folder']);
  });

  it('adds and removes folders at any depth, each level owning its children', async () => {
    const root = await mount();
    await press(root, 'Add folder');
    await press(root, 'Add folder');
    const first = kid(root, 0);
    await press(first, 'Add folder');
    const grandchild = kid(first, 0);
    await press(grandchild, 'Add folder');
    expect(kid(grandchild, 0).folderId).toBe('1.1.1.1');

    await press(grandchild, 'Remove me');
    await settled();
    expect(first.state.children).toEqual([]);
    expect(root.state.children).toEqual(['1.1', '1.2']);

    await press(kid(root, 1), 'Remove me');
    await settled();
    expect(root.state.children).toEqual(['1.1']);
    expect(kids(root)).toEqual([first]);
  });
});
