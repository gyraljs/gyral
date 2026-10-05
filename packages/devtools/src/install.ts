// Installs the devtools hook and mounts <gyral-devtools> (ADR 0017).
import {
  DEVTOOLS_GLOBAL,
  devtoolsLiveComponents,
  type DevEvent,
  type DevtoolsHook,
} from '@gyral/core';
import { DevtoolsPanel, PANEL_TAG } from './panel.js';

export interface DevtoolsOptions {
  /** Start with the panel open. Default false. */
  readonly open?: boolean;
  /** Where to append the panel. Default document.body. */
  readonly parent?: Element;
  /** Toggle shortcut: a KeyboardEvent.code with Alt+Shift. Default 'KeyD' (Alt+Shift+D). */
  readonly shortcutCode?: string;
}

export interface MountedDevtools {
  readonly panel: InstanceType<typeof DevtoolsPanel>;
  /** Removes the panel, the hook and the shortcut. */
  readonly unmount: () => void;
}

/** The panel's own components never appear in its timeline. */
const isOwn = (event: DevEvent): boolean =>
  ('component' in event && event.component.tag === PANEL_TAG) ||
  (event.kind === 'command' && event.owner.startsWith(`<${PANEL_TAG}>`));

/**
 * Mounts the panel and starts listening. Events arrive in batches (one per microtask), so a
 * burst of messages renders once. Returns a handle to remove everything again.
 */
export function mountDevtools(options: DevtoolsOptions = {}): MountedDevtools {
  const panel = new DevtoolsPanel();
  panel.open = options.open ?? false;
  (options.parent ?? document.body).append(panel);

  let batch: DevEvent[] = [];
  const flush = (): void => {
    const events = batch;
    batch = [];
    if (events.length > 0 && panel.isConnected) panel.send({ _tag: 'Received', events });
  };
  const hook: DevtoolsHook = {
    emit(event) {
      if (isOwn(event)) return;
      if (batch.length === 0) queueMicrotask(flush);
      batch.push(event);
    },
  };
  const g = globalThis as Record<string, unknown>;
  const previous = g[DEVTOOLS_GLOBAL];
  g[DEVTOOLS_GLOBAL] = hook;
  // Components that connected before the panel loaded (it usually arrives by dynamic import).
  for (const component of devtoolsLiveComponents()) {
    hook.emit({ kind: 'connect', component, at: performance.now() });
  }

  const code = options.shortcutCode ?? 'KeyD';
  const onKey = (event: KeyboardEvent): void => {
    if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === code) {
      event.preventDefault();
      panel.send({ _tag: 'Toggle' });
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    panel,
    unmount: () => {
      document.removeEventListener('keydown', onKey);
      if (g[DEVTOOLS_GLOBAL] === hook) g[DEVTOOLS_GLOBAL] = previous;
      panel.remove();
    },
  };
}
