// Moving and removing node ranges (view/03-lists.md "Row boundaries", reconciliation step 4).
// A row or instance is tracked by its first and last node, with no markers. Moves use
// `moveBefore()` where the browser has it (it keeps focus, selection, animations, iframe and
// media state); elsewhere `insertBefore` (ADR 0003 tier 2: an inline fallback).

interface MovingParent {
  moveBefore(node: Node, child: Node | null): void;
}

/**
 * Whether moves into `parent` can use `moveBefore` (not Baseline yet: detected on the parent,
 * once per reorder): the browser has it and the parent is in a document (state worth keeping
 * only exists there, and both ends share a root).
 */
export const canMove = (parent: Node): boolean => 'moveBefore' in parent && parent.isConnected;

/** Moves the nodes `first`…`last` (siblings, in order) before `ref` in `parent`. */
export function moveRange(
  parent: Node,
  first: Node,
  last: Node,
  ref: Node | null,
  move: boolean,
): void {
  for (let node = first; ;) {
    const next = node.nextSibling;
    if (move) (parent as unknown as MovingParent).moveBefore(node, ref);
    else parent.insertBefore(node, ref);
    if (node === last || next === null) return;
    node = next;
  }
}

/** Removes the nodes `first`…`last` (siblings, in order). */
export function removeRange(first: Node, last: Node): void {
  const parent = first.parentNode;
  if (parent === null) return;
  for (let node = first; ;) {
    const next = node.nextSibling;
    parent.removeChild(node);
    if (node === last || next === null) return;
    node = next;
  }
}
