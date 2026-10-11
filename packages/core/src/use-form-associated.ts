import { useFormAssociation } from '#spec-features';
import { formFeature } from './form-associated.js';

/** Installed only for compiled applications whose modules name formAssociated. */
export function register(): void {
  useFormAssociation(formFeature);
}
