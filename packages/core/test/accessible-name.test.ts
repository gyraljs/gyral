import { afterEach, describe, expect, it } from 'vitest';
import {
  define,
  findInScope,
  html,
  labelledBy,
  prop,
  settled,
  type Stateless,
} from '../src/index.js';

interface Props {
  readonly target: string;
  readonly fallback?: string | undefined;
}

const Named = define<Stateless, never, Props>()('test-named', {
  props: { target: prop.string({ required: true }), fallback: prop.string() },
  intent: {},
  update: {},
  view: (_s, _i, { props }) =>
    html`<form aria-label="Sign in form" ${labelledBy(props.target, props.fallback)}>
      <button>Go</button>
    </form>`,
});

// A shadow wrapper, so the form sits two shadow roots below the page heading.
define<Stateless, never>()('test-named-outer', {
  intent: {},
  update: {},
  view: () => html`<test-named target="page-title"></test-named>`,
});

type Reflecting = Element & { ariaLabelledByElements?: readonly Element[] | null };

const supported = 'ariaLabelledByElements' in Element.prototype;

const formIn = async (host: Element) => {
  await settled();
  const form = host.shadowRoot?.querySelector('form');
  if (form == null) throw new Error('no form');
  return form as Reflecting;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('labelledBy() across shadow roots (gyral-czi.26)', () => {
  it('names a shadow-root form after a heading in the page', async () => {
    document.body.innerHTML = '<h1 id="page-title">Sign in</h1>';
    const el = new Named();
    el.target = 'page-title';
    document.body.append(el);
    const form = await formIn(el);
    if (supported) {
      expect(form.ariaLabelledByElements?.[0]).toBe(document.getElementById('page-title'));
    } else {
      expect(form.getAttribute('aria-label')).toBe('Sign in');
    }
  });

  it('resolves the id through nested shadow roots', async () => {
    document.body.innerHTML = '<h1 id="page-title">Checkout</h1>';
    const outer = document.createElement('test-named-outer');
    document.body.append(outer);
    await settled();
    const inner = outer.shadowRoot?.querySelector('test-named');
    if (inner == null) throw new Error('no inner');
    const form = await formIn(inner);
    const heading = document.getElementById('page-title');
    expect(findInScope(form, 'page-title')).toBe(heading);
    if (supported) expect(form.ariaLabelledByElements?.[0]).toBe(heading);
  });

  it('falls back to aria-label text when the target is missing', async () => {
    const el = new Named();
    el.target = 'nowhere';
    el.fallback = 'Account form';
    document.body.append(el);
    const form = await formIn(el);
    expect(form.getAttribute('aria-label')).toBe('Account form');
  });
});
