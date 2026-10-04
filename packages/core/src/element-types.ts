import type { LitElement } from 'lit';
import type { DriverOverrides } from './command.js';
import type { StoreOverrides } from './store.js';
import type { ComponentSpec, Tagged } from './types.js';

/** The custom element class produced by `define()`. */
export interface GyralElement<S, M extends Tagged> extends LitElement {
  /** Current model state. */
  readonly state: S;
  /** Feeds a message through `update`, as if an intent had produced it. */
  send(msg: M): void;
  /** Per-instance driver substitutions by name (test fakes). Checked before the spec's. */
  drivers: DriverOverrides;
  /**
   * Per-instance store instances by store name (tests, islands). Checked before the nearest
   * `<gyral-stores>` provider and the document default (ADR 0013).
   */
  stores: StoreOverrides;
  /**
   * Messages applied through `update` right after `init`, before the first render. The server
   * uses it to render a rejected form with the same reducer as the JS path (ADR 0008). Ignored
   * when the element resumes from a hydration seed (the seed already contains their effect).
   */
  initialMessages: readonly Tagged[];
}

export interface GyralElementClass<S, M extends Tagged, P, O extends Tagged = never> {
  /** Instances expose their declared props as settable properties. */
  new (): GyralElement<S, M> & { -readonly [K in keyof P]: P[K] };
  readonly spec: ComponentSpec<S, M, P>;
  readonly tagName: string;
  /** Type-only: the outputs this component emits (read by `child()`). */
  readonly outputs?: O;
}
