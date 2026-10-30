// keyed(key, value): a child value that is recreated, DOM and nested component state included,
// whenever its key changes (view/03-lists.md "keyed"). It is a one-row each(), so it reuses the
// keyed list's reconciliation, server writer and hydration walk, and costs nothing in apps that
// don't call it.
import { each } from './list.js';
import type { ChildValue, ListResult } from './values.js';

// One shared row function: each()'s development purity check is keyed by it, and G0017's
// message names keyed() by its name (dev-check.ts).
const keyedValue = (value: ChildValue): ChildValue => value;

/**
 * Renders `value`, and replaces it with a fresh copy whenever `key` changes: a form cleared
 * after sending, a CSS animation restarted, a child component reset.
 */
export function keyed(key: string | number, value: ChildValue): ListResult {
  return each([value], () => key, keyedValue);
}
