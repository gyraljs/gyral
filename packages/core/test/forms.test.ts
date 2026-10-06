import { afterEach, describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { z } from 'zod';
import {
  define,
  defineForm,
  field,
  fieldErrors,
  form,
  formDataToObject,
  html,
  invalid,
  settled,
} from '../src/index.js';

const Signup = defineForm(
  v.object({
    email: v.pipe(v.string(), v.email('Enter a valid email')),
    age: v.pipe(v.string(), v.transform(Number), v.number(), v.minValue(18, 'Must be 18+')),
  }),
);

interface State {
  readonly saved: readonly string[];
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly nick: string;
}
type Msg =
  | { readonly _tag: 'Register'; readonly email: string; readonly age: number }
  | { readonly _tag: 'Nick'; readonly nick: string };

const Taken = z.string().refine(async (s) => {
  await new Promise((r) => setTimeout(r, 1));
  return s !== 'admin';
}, 'Name taken');

const SignupEl = define<State, Msg>('test-signup', {
  init: () => ({ saved: [], errors: {}, nick: '' }),
  intent: {
    Register: form(Signup, (d) => ({ _tag: 'Register', email: d.email, age: d.age })),
    Nick: field(Taken, (nick) => ({ _tag: 'Nick', nick })),
  },
  update: {
    Register: (s, m) => ({ ...s, saved: [...s.saved, `${m.email}:${String(m.age)}`], errors: {} }),
    Nick: (s, m) => ({ ...s, nick: m.nick }),
    IntentRejected: (s, m) => ({ ...s, errors: fieldErrors(m.issues) }),
  },
  view: (s, i) => html`
    <form data-intent=${i.Register} novalidate>
      <input name="email" ${invalid(s.errors.email)} />
      <input name="age" ${invalid(s.errors.age)} />
      <input name="nick" data-intent=${i.Nick} ${invalid(s.errors.nick)} />
      <button>Go</button>
    </form>
    <form id="native" data-intent=${i.Register}><input name="email" required /></form>
  `,
});

const settle = () => new Promise((r) => setTimeout(r, 10));

async function mount() {
  const el = new SignupEl();
  document.body.append(el);
  await settled();
  const $ = (sel: string) => {
    const found = el.shadowRoot?.querySelector(sel);
    if (!(found instanceof HTMLInputElement || found instanceof HTMLFormElement)) {
      throw new Error(`missing ${sel}`);
    }
    return found;
  };
  const input = (sel: string) => $(sel) as HTMLInputElement;
  const submit = async (values: Record<string, string>) => {
    for (const [k, val] of Object.entries(values)) input(`form input[name=${k}]`).value = val;
    ($('form') as HTMLFormElement).requestSubmit();
    await settled();
  };
  return { el, input, submit, $ };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('formDataToObject', () => {
  it('collapses single values, keeps repeats and name[] as arrays, passes Files', () => {
    const fd = new FormData();
    const file = new File(['x'], 'a.txt');
    fd.append('a', '1');
    fd.append('tags', 'x');
    fd.append('tags', 'y');
    fd.append('one[]', 'z');
    fd.append('file', file);
    expect(formDataToObject(fd)).toEqual({ a: '1', tags: ['x', 'y'], one: ['z'], file });
  });
});

describe('form() and field() (ADR 0008)', () => {
  it('sends the parsed message for valid input', async () => {
    const { el, submit } = await mount();
    await submit({ email: 'a@b.co', age: '30' });
    expect(el.state.saved).toEqual(['a@b.co:30']);
  });

  it('turns schema failures into IntentRejected with per-field issues', async () => {
    const { el, submit } = await mount();
    await submit({ email: 'nope', age: '12' });
    expect(el.state.saved).toEqual([]);
    expect(el.state.errors).toEqual({ email: ['Enter a valid email'], age: ['Must be 18+'] });
  });

  it('mirrors errors to native validity and clears them on the next input', async () => {
    const { el, input, submit } = await mount();
    await submit({ email: 'nope', age: '30' });
    const email = input('form input[name=email]');
    expect(email.validationMessage).toBe('Enter a valid email');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(input('form input[name=age]').validity.valid).toBe(true);

    email.value = 'fixed@b.co';
    email.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.send({ _tag: 'Nick', nick: 'rerender' }); // same errors array: must not re-apply
    await settled();
    expect(email.validity.valid).toBe(true);
    expect(email.hasAttribute('aria-invalid')).toBe(false);
  });

  it('supports async schemas in field()', async () => {
    const { el, input } = await mount();
    const nick = input('input[name=nick]');
    nick.value = 'admin';
    nick.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settle();
    expect(el.state.errors).toEqual({ nick: ['Name taken'] });
    nick.value = 'mike';
    nick.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await settle();
    expect(el.state.nick).toBe('mike');
  });

  it('lets native constraints block the submit before parsing', async () => {
    const { el, $ } = await mount();
    ($('#native') as HTMLFormElement).requestSubmit();
    await settle();
    expect(el.state.saved).toEqual([]);
    expect(el.state.errors).toEqual({});
  });
});

// ADR 0008 addendum (gyral-czi.37): keep `required` for no-JS visitors, then hand messages to
// the schema once the component is live by adding `novalidate` in the Hydrated reducer.
const Named = defineForm(v.object({ name: v.pipe(v.string(), v.minLength(1, 'Enter your name')) }));
type NameMsg = { readonly _tag: 'Save'; readonly name: string };
interface NameState {
  readonly live: boolean;
  readonly errors: Readonly<Record<string, readonly string[]>>;
}
const NameEl = define<NameState, NameMsg>('test-schema-messages', {
  init: () => ({ live: false, errors: {} }),
  intent: { Save: form(Named, (d) => ({ _tag: 'Save', name: d.name })) },
  update: {
    Save: (s) => ({ ...s, errors: {} }),
    Hydrated: (s) => ({ ...s, live: true }),
    IntentRejected: (s, m) => ({ ...s, errors: fieldErrors(m.issues) }),
  },
  view: (s, i) => html`
    <form data-intent=${i.Save} ?novalidate=${s.live}>
      <input name="name" required ${invalid(s.errors.name)} />
    </form>
  `,
});

describe('schema messages for required fields (gyral-czi.37)', () => {
  it('shows the schema message once Hydrated adds novalidate', async () => {
    const el = new NameEl();
    document.body.append(el);
    await settled();
    const formEl = el.shadowRoot?.querySelector('form');
    if (formEl == null) throw new Error('no form');
    expect(formEl.noValidate).toBe(true);
    formEl.requestSubmit();
    await settle();
    expect(el.state.errors).toEqual({ name: ['Enter your name'] });
  });
});
