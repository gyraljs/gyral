import { internalsOf } from './element-internals.js';
import { afterRender, POST_HYDRATED } from './scheduler.js';
import type { Ctx } from './types.js';
import type { HostModel } from './host-model.js';

/** A native submitted value, or null to omit this component from the submission. */
export type FormControlValue = string | File | FormData | null;

/** Native constraint flags and a validation bubble anchor in the component's render root. */
export interface FormControlValidity {
  readonly flags: ValidityStateFlags;
  readonly message: string;
  readonly anchor?: string;
}

/** Pure model projections applied by Gyral to the host's ElementInternals (ADR 0008). */
export interface FormAssociation<S, P> {
  readonly value: (state: S, ctx: Ctx<P>) => FormControlValue;
  readonly state?: (state: S, ctx: Ctx<P>) => FormControlValue;
  readonly validity?: (state: S, ctx: Ctx<P>) => FormControlValidity | undefined;
}

/** Framework message: the owning native form was reset. */
export interface FormReset {
  readonly _tag: 'FormReset';
}

/** Framework message: the host or its fieldset changed the effective disabled state. */
export interface FormDisabled {
  readonly _tag: 'FormDisabled';
  readonly disabled: boolean;
}

/** Framework message: native session restoration or autofill supplied control state. */
export interface FormStateRestore {
  readonly _tag: 'FormStateRestore';
  readonly state: FormControlValue;
  readonly mode: 'restore' | 'autocomplete';
}

export type FormMessage = FormReset | FormDisabled | FormStateRestore;

export interface FormControl {
  receive(msg: FormMessage): void;
  sync<S, P>(projection: FormAssociation<S, P>, state: S, ctx: Ctx<P>, root: ParentNode): void;
}

const controls = new WeakMap<HTMLElement, FormControl>();
const projections = new WeakMap<HTMLElement, FormAssociation<unknown, unknown>>();

/** Native reactions must be installed before customElements.define() reads the prototype. */
function installFormCallbacks(Element: CustomElementConstructor, enabled: boolean): void {
  if (!enabled) return;
  Object.defineProperty(Element, 'formAssociated', { value: true });
  Object.assign(Element.prototype, {
    formResetCallback(this: HTMLElement): void {
      controls.get(this)?.receive({ _tag: 'FormReset' });
    },
    formDisabledCallback(this: HTMLElement, disabled: boolean): void {
      controls.get(this)?.receive({ _tag: 'FormDisabled', disabled });
    },
    formStateRestoreCallback(
      this: HTMLElement,
      state: FormControlValue,
      mode: 'restore' | 'autocomplete',
    ): void {
      controls.get(this)?.receive({ _tag: 'FormStateRestore', state, mode });
    },
  });
}

/** Attach once in the constructor; defer pre-render reactions until hydration has committed. */
export function createFormControl(
  host: HTMLElement,
  model: Pick<HostModel<unknown, unknown>, 'hasReducer' | 'dispatch'>,
): FormControl {
  const dispatch = (msg: FormMessage): void => {
    if (model.hasReducer(msg._tag)) model.dispatch(msg);
  };
  const internals = internalsOf(host);
  let live = false;
  const pending: FormMessage[] = [];
  const control: FormControl = {
    receive(msg) {
      if (live) dispatch(msg);
      else pending.push(msg);
    },
    sync(projection, state, ctx, root) {
      const value = projection.value(state, ctx);
      if (projection.state === undefined) internals.setFormValue(value);
      else internals.setFormValue(value, projection.state(state, ctx));
      const validity = projection.validity?.(state, ctx);
      const anchor =
        validity?.anchor === undefined ? undefined : root.querySelector(validity.anchor);
      if (anchor != null && !(anchor instanceof HTMLElement)) {
        throw new TypeError('The form validity anchor must select an HTMLElement.');
      }
      internals.setValidity(validity?.flags ?? {}, validity?.message ?? '', anchor ?? undefined);
      live = true;
      if (pending.length > 0) {
        const messages = pending.splice(0);
        afterRender(POST_HYDRATED, () => {
          for (const msg of messages) dispatch(msg);
        });
      }
    },
  };
  controls.set(host, control);
  return control;
}

export const formFeature = {
  create<S, P>(
    host: HTMLElement,
    model: Pick<HostModel<unknown, unknown>, 'hasReducer' | 'dispatch'>,
    projection: FormAssociation<S, P> | undefined,
  ): void {
    if (projection === undefined) return;
    projections.set(host, projection as unknown as FormAssociation<unknown, unknown>);
    createFormControl(host, model);
  },
  sync(host: HTMLElement, state: unknown, ctx: Ctx<unknown>, root: ParentNode): void {
    const projection = projections.get(host);
    if (projection !== undefined) controls.get(host)?.sync(projection, state, ctx, root);
  },
  install: installFormCallbacks,
};
