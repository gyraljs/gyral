// A form whose model starts with a field error (e.g. seeded from a server-side 422), for
// invalid() across SSR + hydration: rendered by invalid.node.test.ts, hydrated by
// invalid-hydration.test.ts.
import { define, html, invalid } from '@gyral/core';

interface State {
  readonly errors: Readonly<Record<string, readonly string[]>>;
  readonly saves: number;
}
type Msg = { readonly _tag: 'Save' } | { readonly _tag: 'Reject' } | { readonly _tag: 'Clear' };

const taken = (): Readonly<Record<string, readonly string[]>> => ({ email: ['Email is taken'] });

export const Signup = define<State, Msg>()('test-invalid-form', {
  init: () => ({ errors: taken(), saves: 0 }),
  intent: { Save: () => ({ _tag: 'Save' }) },
  update: {
    Save: (s) => ({ ...s, saves: s.saves + 1 }),
    Reject: (s) => ({ ...s, errors: taken() }), // a new array: invalid() applies it again
    Clear: (s) => ({ ...s, errors: {} }),
  },
  view: (s, i) =>
    html`<form data-intent=${i.Save}>
      <label for="email">Email</label>
      <input id="email" name="email" value="taken@example.com" ${invalid(s.errors['email'])} />
      <button>Save</button>
    </form>`,
});
