// The element define() creates (docs/design-docs/view/05-element.md): a plain HTMLElement
// subclass. Declared props are prototype accessors over Standard Schema builders; renders go
// through the global scheduler (view/04-scheduler.md); intents are delegated listeners on the
// root (ADR 0001). The model side (state, commands, stores) is host-model.ts.
import { DEVTOOLS_ENABLED, devConnect, devHydrated } from '#devtools';
import type { DriverOverrides } from './command.js';
import type { GyralElement } from './element-types.js';
import { HostModel, type ModelCommand } from './host-model.js';
import { takeSeed } from './hydration.js';
import { handleIntent, hostDepth, intentNames, listenForIntents } from './intent.js';
import { scheduleIsland } from './islands.js';
import { isLight } from './light-dom.js';
import {
  attributeOf,
  attributeValue,
  missingRequired,
  propertyValue,
  readProps,
  type PropTable,
} from './props.js';
import {
  afterRender,
  markDirty,
  POST_HYDRATED,
  POST_INIT,
  POST_STATES,
  type HostTask,
} from './scheduler.js';
import { stateSync, type StateSync } from './states.js';
import type { StoreOverrides } from './store.js';
import type { ComponentSpec, IntentNames, IntentParser, Tagged } from './types.js';
import { render, sheetsFor } from './view/index.js';

const DEFER = 'defer-hydration';

type Bag = Record<string, unknown>;

/** The element class for `spec` (not yet registered); define() types it for the spec. */
export function elementClass<S, M extends Tagged, P>(
  tag: string,
  spec: ComponentSpec<S, M, P>,
): CustomElementConstructor {
  const table = (spec.props ?? {}) as PropTable;
  const names = Object.keys(table);
  const attrs = new Map<string, string>();
  const light = isLight(spec);
  let sheets: CSSStyleSheet[] | undefined;
  const parsers = spec.intent as Readonly<Record<string, IntentParser<M> | undefined>>;
  const model = spec as unknown as ComponentSpec<S, Tagged, P>;

  class Element extends HTMLElement implements GyralElement<S, M> {
    static readonly spec = spec;
    static readonly tagName = tag;
    static get observedAttributes(): string[] {
      return [...attrs.keys(), DEFER];
    }

    static {
      for (const name of names) {
        const def = table[name];
        const attr = def === undefined ? undefined : attributeOf(name, def);
        if (attr !== undefined) attrs.set(attr, name);
        Object.defineProperty(this.prototype, name, {
          configurable: true,
          enumerable: true,
          get(this: Element): unknown {
            return this.#values[name];
          },
          set(this: Element, value: unknown) {
            this.#write(name, propertyValue(tag, name, table[name], value));
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
    /** init's commands for a server-rendered host: started after its first render. */
    #afterInit: readonly ModelCommand[] = [];
    #internals: ElementInternals | undefined;
    #states: StateSync | null | undefined;
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
        props: () => readProps(this.#values, table),
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
      if (!this.#model.ready) {
        const missing = missingRequired(this.#values, table);
        if (missing.length > 0) {
          console.warn(`<${tag}> is missing required prop(s): ${missing.join(', ')}.`);
        }
      }
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
      if (this.hasAttribute(DEFER))
        scheduleIsland(this); // released by attributeChangedCallback
      else this.#start();
    }

    /** `moveBefore()` keeps everything: no disconnect, no re-resolution (view/03-lists.md). */
    connectedMoveCallback(): void {
      // Intentionally empty.
    }

    disconnectedCallback(): void {
      this.#model.disconnect();
      if (DEVTOOLS_ENABLED) devConnect(this, tag, false);
    }

    attributeChangedCallback(name: string, _old: string | null, raw: string | null): void {
      if (name === DEFER) {
        if (raw === null && this.isConnected && this.#root === undefined) this.#start();
        return;
      }
      const prop = attrs.get(name);
      if (prop !== undefined) this.#write(prop, attributeValue(tag, prop, table[prop], name, raw));
    }

    #write(name: string, value: unknown): void {
      if (Object.is(this.#values[name], value)) return;
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
        this.#values[name] = propertyValue(tag, name, def, value, 'the seed');
      }
      this.#afterInit = this.#model.resume(seed);
      this.#serverRendered = true;
    }

    #start(): void {
      if (light) {
        this.#root = this;
      } else {
        const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = sheets ??= sheetsFor(spec.styles);
        this.#root = root;
      }
      listenForIntents(this.#root, spec.events ?? [], this.#onEvent);
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
      const view = spec.view(this.state, intentNames as IntentNames<M>, this.#model.ctx());
      // Phase 5 (gyral-g1r.10): hydrate the server's DOM here instead of clearing it. Until then
      // a server-rendered host resumes its state from the seed and renders fresh.
      if (!this.#rendered && this.#serverRendered) root.replaceChildren();
      render(view, root);
      if (spec.states !== undefined) afterRender(POST_STATES, this.#syncStates);
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

    #syncStates = (): void => {
      if (this.#states === undefined) {
        // ElementInternals is attached lazily, once, only when a feature needs it (05).
        this.#internals ??=
          typeof this.attachInternals === 'function' ? this.attachInternals() : undefined;
        this.#states = stateSync(this.#internals) ?? null;
      }
      if (this.#states !== null && spec.states !== undefined) this.#states(spec.states(this.state));
    };

    #onEvent = (event: Event): void => {
      if (this.#root === undefined) return;
      handleIntent(event, this.#root, parsers, tag, (msg) => {
        if (msg !== undefined && this.isConnected) this.#model.dispatch(msg);
      });
    };
  }
  return Element;
}
