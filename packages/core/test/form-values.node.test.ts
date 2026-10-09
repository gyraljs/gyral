import { describe, expect, expectTypeOf, it } from 'vitest';
import * as v from 'valibot';
import { defineForm, formValues, html, validateForm } from '../src/index.js';
import { renderToString } from '../src/server.js';

const Contact = defineForm(
  v.object({
    name: v.pipe(v.string(), v.nonEmpty('Enter a name.')),
    email: v.pipe(v.string(), v.email('Enter a valid email address.')),
    topics: v.array(v.string()),
    subscribe: v.optional(v.string()),
  }),
);

const submission = (): FormData => {
  const data = new FormData();
  data.append('name', 'Ada');
  data.append('email', 'not-an-email');
  data.append('topics', 'billing');
  data.append('topics', 'support');
  data.append('tags[]', 'urgent');
  data.append('subscribe', 'on');
  data.append('attachment', new File(['x'], 'notes.txt'));
  return data;
};

describe('formValues', () => {
  it('returns text values: single strings, repeated names and name[] as arrays, no Files', () => {
    expect(formValues(Contact, submission())).toEqual({
      name: 'Ada',
      email: 'not-an-email',
      topics: ['billing', 'support'],
      tags: ['urgent'],
      subscribe: 'on',
    });
  });

  it('leaves out an unchecked checkbox and an empty submission', () => {
    expect(formValues(Contact, new FormData())).toEqual({});
  });

  it('matches the values a rejection carries', () => {
    const data = submission();
    const result = validateForm(Contact, 'Send', data);
    if (result instanceof Promise || result.ok) throw new Error('expected a sync rejection');
    expect(formValues(Contact, data)).toEqual(result.rejected.values);
  });

  it('keys the result by the definition, and accepts a bare schema', () => {
    const values = formValues(Contact, submission());
    expectTypeOf(values.name).toEqualTypeOf<string | readonly string[] | undefined>();
    // @ts-expect-error not a field of the form
    expect(values.phone).toBeUndefined();
    expect(formValues(Contact.schema, submission())['name']).toBe('Ada');
  });

  it('re-fills a server-rendered form after failed validation', () => {
    const data = submission();
    const values = formValues(Contact, data);
    const text = (key: keyof typeof values): string => {
      const value = values[key];
      return typeof value === 'string' ? value : '';
    };
    const markup = renderToString(
      html`<form method="post">
        <input name="name" value=${text('name')} />
        <input name="email" type="email" value=${text('email')} aria-invalid="true" />
        <input name="subscribe" type="checkbox" ?checked=${values.subscribe !== undefined} />
      </form>`,
    );
    expect(markup).toContain('value="Ada"');
    expect(markup).toContain('value="not-an-email"');
    expect(markup).toMatch(/type="checkbox"[^>]*checked/);
  });
});
