// The element define() creates (docs/design-docs/view/05-element.md): a plain HTMLElement
// subclass. Declared props are prototype accessors over Standard Schema builders; renders go
// through the global scheduler (view/04-scheduler.md); intents are delegated listeners on the
// root (ADR 0001). The model side (state, commands, stores) is host-model.ts.
import { DEVTOOLS_ENABLED, devConnect, devHydrated } from '#devtools';
import type { DriverOverrides } from './command.js';
import type { GyralElement } from './element-types.js';
import { HostModel, type ModelCommand } from './host-model.js';
import { hydrationCode, takeSeed, whenHydrationLoads } from '#hydration-loader';
import {
  DEFAULT_EVENTS,
  eventsOf,
  handleIntent,
  hostDepth,
  intentNames,
  listenForIntents,
} from './intent.js';
import { isLight } from './light-dom.js';
import { features } from './features.js';
import type { PropFeature, PropTable, propertyValue } from './props.js';
import {
  afterRender,
  markDirty,
  POST_HYDRATED,
  POST_INIT,
  POST_STATES,
  type HostTask,
} from './scheduler.js';
import { checkSpecFeatures, customStates } from '#spec-features';
import type { StoreOverrides } from './store.js';
import type { ComponentSpec, IntentNames, IntentParser, Tagged } from './types.js';
import { DEV, render, sheetsFor, suspendHooks, type Markup } from './view/index.js';

const DEFER = 'defer-hydration';

type Bag = Record<string, unknown>;
/** The element class for `spec` (not yet registered); define() types it for the spec. */
export function elementClass<S, M extends Tagged, P>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): CustomElementConstructor {
  const table = (spec.props ?? {}) as PropTable;
  const names = Object.keys(table);
  // Registered by the prop builders (features.ts): set whenever a component declares props.
  const props = features.props as PropFeature;
  /** Property sets and seeds: checked in development, kept as given in production (05). */
  const checked = (props: PropFeature): typeof propertyValue =>
    props.propertyValue as typeof propertyValue;
  const attrs = new Map<string, string>();
  const light = isLight(spec);
  let sheets: CSSStyleSheet[] | undefined;
  const parsers = spec.intent as Readonly<Record<string, IntentParser<M> | undefined>>;
  const model = spec as unknown as ComponentSpec<S, Tagged, P>;
  if (DEV) checkSpecFeatures(tag, spec);

  class Element extends HTMLElement implements GyralElement<S, M> {
    static readonly spec = spec;
    static readonly tagName = tag;
    static get observedAttributes(): string[] {
      return [...attrs.keys(), DEFER];
    }

    static {
      for (const name of names) {
        const def = table[name];
        const attr = def === undefined ? undefined : props.attributeOf(name, def);
        if (attr !== undefined) attrs.set(attr, name);
        Object.defineProperty(this.prototype, name, {
          configurable: true,
          enumerable: true,
          get(this: Element): unknown {
            return this.#values[name];
          },
          set(this: Element, value: unknown) {
            this.#write(name, DEV ? checked(props)(tag, name, table[name], value) : value);
          },
        });
      }
    }

    declare drivers: DriverOverrides;
    declare stores: StoreOverrides;
    declare initialMessages: readonly Tagged[];

    #values: Bag = {};
    #root: ShadowRoot | HTMLElement | undefined;
    #rendered = false;
    /** Something changed while disconnected: render on reconnect. */
    #stale = false;
    #serverRendered = false;
    /** The first render adopts the server's DOM (07): resumed from a seed, root not empty. */
    #hydrating = false;
    /** init's commands for a server-rendered host: started after its first render. */
    #afterInit: readonly ModelCommand[] = [];
    #task: HostTask = {
      tag,
      depth: 0,
      render: () => {
        this.#render();
      },
    };
    #model = new HostModel<S, P>(
      {
        el: this,
        tag,
        props: () => (names.length > 0 ? props.readProps(this.#values, table) : {}),
        root: () => this.#root,
        invalidate: (onFrame) => {
          this.#invalidate(onFrame);
        },
      },
      model,
    );

    constructor() {
      super();
      const self = this as unknown as Bag;
      self['drivers'] ??= {};
      self['stores'] ??= {};
      self['initialMessages'] ??= [];
      // Upgrade capture: a property set before the class was defined hides the accessor.
      for (const name of names) {
        if (!Object.hasOwn(this, name)) continue;
        const value = self[name];
        Reflect.deleteProperty(this, name);
        self[name] = value;
      }
    }

    get state(): S {
      return this.#state();
    }

    #state(): S {
      if (!this.#model.ready && names.length > 0) props.warnMissing(tag, this.#values, table);
      return this.#model.state(this.initialMessages);
    }

    send(msg: M): void {
      this.#model.dispatch(msg);
    }

    connectedCallback(): void {
      if (this.#root !== undefined) {
        this.#connect();
        return;
      }
      this.#resume();
      this.#begin();
    }

    /** `moveBefore()` keeps everything: no disconnect, no re-resolution (view/03-lists.md). */
    connectedMoveCallback(): void {
      // Intentionally empty.
    }

    disconnectedCallback(): void {
      this.#model.disconnect();
      // Element hooks' dispose; they run client again after the render on reconnect (02).
      if (suspendHooks(this.#root)) this.#stale = true;
      if (DEVTOOLS_ENABLED) devConnect(this, tag, false);
    }

    attributeChangedCallback(name: string, _old: string | null, raw: string | null): void {
      if (name === DEFER) {
        if (raw === null && this.isConnected && this.#root === undefined) this.#begin();
        return;
      }
      const prop = attrs.get(name);
      if (prop !== undefined)
        this.#write(prop, props.attributeValue(tag, prop, table[prop], name, raw));
    }

    #write(name: string, value: unknown): void {
      // The prop's `equals` (prop.ts): `Object.is`, the same JSON for prop.json, or the option.
      if (table[name]?.equals(this.#values[name], value)) return;
      this.#values[name] = value;
      if (this.#model.ready) this.#invalidate();
    }

    /** Hydration seeds (ADR 0012): the server's state and the props no attribute carried. */
    #resume(): void {
      if (this.#model.ready) return;
      const seed = takeSeed(this);
      if (seed === undefined) return;
      for (const [name, value] of Object.entries(seed.props)) {
        const def = table[name];
        if (def === undefined || this.#values[name] !== undefined) continue;
        this.#values[name] = DEV ? checked(props)(tag, name, def, value, 'the seed') : value;
      }
      this.#afterInit = this.#model.resume(seed);
      this.#serverRendered = true;
    }

    /**
     * Starts the host, or waits: for the hydration code (a server-rendered host or an island,
     * view/07-hydration.md "Loading"), then for an island's trigger (released by
     * attributeChangedCallback).
     */
    #begin(): void {
      const defer = this.hasAttribute(DEFER);
      if (hydrationCode === undefined && (this.#serverRendered || defer)) {
        whenHydrationLoads(() => {
          if (this.isConnected && this.#root === undefined) this.#begin();
        });
      } else if (defer && hydrationCode !== null) hydrationCode?.scheduleIsland(this);
      else this.#start();
    }

    #start(): void {
      // `shadow: { delegatesFocus }` (05 "Focus"); `true` and `undefined` spread nothing.
      const root = light
        ? this
        : (this.shadowRoot ??
          this.attachShadow({ ...(spec.shadow as object | undefined), mode: 'open' }));
      this.#root = root;
      this.#hydrating = this.#serverRendered && hydrationCode != null && root.hasChildNodes();
      sheets ??= light ? [] : sheetsFor(spec.styles);
      // Rendering fresh: a shadow root without a seed (hand-written DSD) or a server-rendered
      // host whose hydration code failed to load starts empty.
      if (!this.#hydrating) {
        if (!light || this.#serverRendered) root.replaceChildren();
        if (!light) (root as ShadowRoot).adoptedStyleSheets = sheets;
      }
      this.#listen(DEFAULT_EVENTS);
      if (spec.events !== undefined) this.#listen(spec.events);
      this.#state(); // init, unless resumed from a seed
      this.#connect();
    }

    #connect(): void {
      this.#task.depth = hostDepth(this);
      const rebound = this.#model.connect();
      if (DEVTOOLS_ENABLED) devConnect(this, tag, true);
      if (!this.#rendered || this.#stale || rebound) this.#invalidate();
    }

    #invalidate(onFrame = false): void {
      if (this.#root === undefined) return;
      if (this.isConnected) markDirty(this.#task, onFrame);
      else this.#stale = true;
    }

    /** One render (the scheduler calls it): PropsChanged first, then the view and its commit. */
    #render(): void {
      const root = this.#root;
      if (root === undefined || !this.isConnected) {
        this.#stale = true;
        return;
      }
      this.#stale = false;
      this.#model.syncProps(names);
      const view = spec.view(this.state, intentNames as IntentNames<string>, this.#model.ctx());
      if (this.#hydrating) {
        hydrationCode?.hydrateRoot(this, tag, view, root, light ? undefined : sheets, this.#seen);
        this.#hydrating = false;
      } else render(view, root, this.#seen);
      const states = spec.states;
      const sync = customStates;
      if (states !== undefined && sync !== undefined) {
        afterRender(POST_STATES, () => {
          sync(this, states(this.state));
        });
      }
      if (this.#rendered) return;
      this.#rendered = true;
      if (DEVTOOLS_ENABLED) devHydrated(this, tag, this.#serverRendered);
      if (this.#model.hasReducer('Hydrated')) {
        const msg = { _tag: 'Hydrated', serverRendered: this.#serverRendered } as Tagged;
        afterRender(POST_HYDRATED, () => {
          this.#model.dispatch(msg);
        });
      }
      const commands = this.#afterInit;
      this.#afterInit = [];
      if (commands.length > 0) {
        afterRender(POST_INIT, () => {
          this.#model.run(commands);
        });
      }
    }

    /** Intent event types this host's root listens for (view/05-element.md "Intent events"). */
    #listening = new Set<string>();

    #listen(types: readonly string[]): void {
      listenForIntents(this.#root as Node, this.#listening, types, this.#onEvent);
    }

    /** Told about each template a render instantiates: listen for what its markup names. */
    #seen = (markup: Markup): void => {
      this.#listen(eventsOf(markup));
    };

    #onEvent = (event: Event): void => {
      if (this.#root === undefined) return;
      handleIntent(event, this.#root, parsers, tag, this.#model, (msg) => {
        if (msg !== undefined && this.isConnected) this.#model.dispatch(msg);
      });
    };
  }
  return Element;
}
