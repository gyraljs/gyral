// Where the browser history finds the head applier (ADR 0019). `setHead()` fills it on first
// call, so router apps that never set a head don't bundle internal/head.ts.
import type { Head } from '@gyral/core';

export const headSlot: { apply?: (doc: Document, head: Head) => void } = {};
