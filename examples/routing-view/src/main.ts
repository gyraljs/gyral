import '../../shared/base.css';
import { provideDrivers } from '@gyral/core';
import { makeRouter } from '@gyral/router';
import './app.js';

// This app owns the whole page, so its router captures link clicks (ADR 0009). Drivers are
// configured once, at the entry, for every component on the page (ADR 0006).
provideDrivers(document.body, { router: makeRouter({ captureLinks: true }) });
import '../../shared/devtools.js'; // ?devtools opens the panel (dev only)
