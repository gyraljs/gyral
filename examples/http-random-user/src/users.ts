import type { Command } from '@gyral/core';
import { get, type HttpError } from '@gyral/http';
import * as v from 'valibot';

/** Only the fields the view shows; extra fields in the response are ignored. */
const User = v.object({
  id: v.number(),
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
  website: v.string(),
  phone: v.string(),
  company: v.object({ name: v.string() }),
});

export type User = v.InferOutput<typeof User>;

export const USER_COUNT = 10;

export const userUrl = (id: number): string =>
  `https://jsonplaceholder.typicode.com/users/${String(id)}`;

/**
 * `exhaust`: every click asks for "a random user", so any in-flight answer satisfies the
 * clicks that arrive while it loads. Ignoring them avoids redundant requests; `switch`
 * would cancel and restart for no visible benefit (ADR 0006).
 */
export function fetchUser<M>(
  id: number,
  onSuccess: (user: User) => M,
  onFailure: (error: HttpError) => M,
): Command<M> {
  return get(userUrl(id), {
    schema: User,
    key: 'users',
    concurrency: 'exhaust',
    onSuccess,
    onFailure,
  });
}
