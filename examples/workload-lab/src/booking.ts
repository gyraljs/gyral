import { define, each, html, type TemplateResult, type IntentNames } from '@gyral/core';
import { initialBooking, reduce, subscriptions } from './booking-model.js';
import { controls } from './styles.js';
import type { Msg, Row, State } from './booking-types.js';

type Names = IntentNames<'Viewer' | 'Draft' | 'Save' | 'Retry'>;
function rowView(row: Row, s: State, i: Names): TemplateResult {
  const draft = s.drafts[row.id];
  const busy = s.pending !== undefined && s.pending.phase !== 'done';
  return html`<form data-row=${row.id} data-intent=${i.Save}>
    <fieldset>
      <legend>${row.title}</legend>
      <p>Authoritative quantity: ${row.quantity}; row version: ${row.version}</p>
      ${row.privateNote === undefined ? undefined : html`<p>${row.privateNote}</p>`}
      <input type="hidden" name="id" value=${row.id} />
      <label
        >Quantity (1–8)
        <input
          type="number"
          name="quantity"
          min="1"
          max="8"
          step="1"
          required
          value=${draft?.quantity ?? row.quantity}
          data-row=${row.id}
          data-intent=${i.Draft}
        />
      </label>
      <label
        ><input
          type="checkbox"
          name="confirmed"
          required
          data-row=${row.id}
          ?checked=${draft?.confirmed ?? false}
          data-intent=${i.Draft}
        />
        Confirm this reservation</label
      >
      <button type="submit" ?disabled=${busy}>Save ${row.title}</button>
    </fieldset>
  </form>`;
}

export const Booking = define<State, Msg>()('gy-booking', {
  init: initialBooking,
  intent: {
    Viewer: ({ value }) =>
      value === 'guest' || value === 'member' ? { _tag: 'Viewer', viewer: value } : undefined,
    Draft: ({ target, value, checked }) => {
      const id = target.getAttribute('data-row');
      if (id === null) return undefined;
      if (target.getAttribute('name') === 'confirmed' && checked !== undefined)
        return { _tag: 'Draft', id, confirmed: checked };
      const quantity = Number(value);
      return value !== '' && Number.isInteger(quantity)
        ? { _tag: 'Draft', id, quantity }
        : undefined;
    },
    Save: ({ formData }) => {
      const id = formData?.get('id');
      const raw = formData?.get('quantity');
      const quantity = typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
      const confirmed = formData?.get('confirmed') === 'on';
      return typeof id === 'string' &&
        Number.isInteger(quantity) &&
        quantity >= 1 &&
        quantity <= 8 &&
        confirmed
        ? { _tag: 'Save', id, quantity, confirmed }
        : undefined;
    },
    Retry: true,
  },
  subscriptions,
  update: {
    Viewer: reduce,
    Snapshot: reduce,
    Draft: reduce,
    Save: reduce,
    Key: reduce,
    Committed: reduce,
    Failed: reduce,
    Retry: reduce,
  },
  view: (s, i) => html`
    <label
      >Viewer
      <select data-intent=${i.Viewer} value=${s.viewer}>
        <option value="member">Member</option>
        <option value="guest">Guest</option>
      </select></label
    >
    <p>Snapshot revision: ${s.revision}. Drafts stay attached to their row IDs.</p>
    ${each(
      s.rows,
      (row) => row.id,
      (row, picked): TemplateResult => rowView(row, picked.state, picked.intents),
      () => ({ state: s, intents: i }),
    )}
    <output aria-live="polite">${s.notice}</output>
    ${
      s.pending?.phase === 'failed' || s.pending?.phase === 'reload-failed'
        ? html`<button type="button" data-intent=${i.Retry}>
            ${s.pending.phase === 'failed' ? 'Retry the same write' : 'Retry snapshot reload'}
          </button>`
        : undefined
    }
  `,
  styles: controls,
});
