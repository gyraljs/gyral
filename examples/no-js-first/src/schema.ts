import { defineForm } from '@gyral/core';
import * as v from 'valibot';

export interface Attendee {
  readonly name: string;
  /** Extra people they bring. */
  readonly guests: number;
}

export const NameField = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty('Enter your name.'),
  v.maxLength(40, 'Use 40 characters or fewer.'),
);

export const EmailField = v.pipe(v.string(), v.trim(), v.email('Enter a valid email address.'));

/**
 * One schema for every path: the server's `formAction` (JavaScript off), the client's
 * `form()` intent, and, field by field, the checks as you type (JavaScript on).
 */
export const RsvpForm = defineForm(
  v.object({
    name: NameField,
    email: EmailField,
    guests: v.pipe(v.picklist(['0', '1', '2', '3'], 'Choose 0 to 3 guests.'), v.transform(Number)),
  }),
);

/** The single fields that are checked as you type, by their `name`. */
export const LIVE_FIELDS: Readonly<Record<string, typeof NameField | typeof EmailField>> = {
  name: NameField,
  email: EmailField,
};
