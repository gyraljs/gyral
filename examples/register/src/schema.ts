import { defineForm } from '@gyral/core';
import * as v from 'valibot';

// Pretend database lookup. Async on purpose: Standard Schema validation may be async, and the
// server half must await it exactly like the client does (ADR 0008).
const taken = new Set(['admin', 'root']);
const nameIsFree = async (name: string): Promise<boolean> => {
  await Promise.resolve();
  return !taken.has(name.toLowerCase());
};

/**
 * One schema for both paths: the client's `form()` intent and the server's `formAction`.
 * Native constraints in the markup (required, type=email, minlength) catch the easy cases
 * first; this schema adds what HTML can't express.
 */
export const RegisterForm = defineForm(
  v.pipeAsync(
    v.objectAsync({
      name: v.pipeAsync(
        v.string(),
        v.trim(),
        v.nonEmpty('Enter a name.'),
        v.checkAsync(nameIsFree, 'That name is taken.'),
      ),
      email: v.pipe(v.string(), v.trim(), v.email('Enter a valid email address.')),
      password: v.pipe(v.string(), v.minLength(8, 'Use at least 8 characters.')),
      confirm: v.string(),
    }),
    v.forward(
      v.partialCheck(
        [['password'], ['confirm']],
        (input) => input.password === input.confirm,
        'The passwords do not match.',
      ),
      ['confirm'],
    ),
  ),
);
