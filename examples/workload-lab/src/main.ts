import '../../shared/base.css';
import './page.css';
import './sequence.js';
import './solver.js';
import './booking.js';
import './grid.js';
import { provideDrivers } from '@gyral/core';
import { BookingService, bookingDrivers } from './booking-service.js';
import '../../shared/devtools.js';

// The page owns the service. Removing a component releases only its subscriptions.
const service = new BookingService();
const release = provideDrivers(document.body, bookingDrivers(service));
import.meta.hot?.dispose(() => {
  release();
  service.dispose();
});

const help = document.getElementById('grid-help');
const opener = document.getElementById('grid-help-opener');
if (help !== null && opener !== null && 'showPopover' in help) {
  help.setAttribute('popover', 'auto');
  opener.setAttribute('popovertarget', 'grid-help');
  opener.removeAttribute('hidden');
}
