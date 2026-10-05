import {
  Directive,
  directive,
  PartType,
  type AttributePart,
  type PartInfo,
} from 'lit/directive.js';

/**
 * A boolean that is right both in server-rendered markup and in the live DOM (ADR 0012).
 * Use it in a boolean attribute binding:
 *
 *   <input type="checkbox" ?checked=${liveBoolean(s.on)} />
 *   <option ?selected=${liveBoolean(s.sort === 'price')}>Price</option>
 *
 * - On the server it renders the attribute when true and omits it when false.
 *   (A property binding, `.checked=${false}`, is serialized by Lit SSR as `checked="false"`,
 *   which *checks* the box. Never bind boolean form state as a property in SSR'd views.)
 * - In the browser it also sets the element's property of the same name (`checked`,
 *   `selected`, `open`, …), so the control follows model state even after the user has
 *   changed it. The attribute alone stops controlling `checked` once a box has been clicked.
 */
class LiveBoolean extends Directive {
  constructor(info: PartInfo) {
    super(info);
    if (info.type !== PartType.BOOLEAN_ATTRIBUTE) {
      throw new Error('liveBoolean() must be used in a boolean attribute: ?checked=${…}');
    }
  }

  override render(value: boolean): boolean {
    return value;
  }

  override update(part: AttributePart, [value]: [boolean]): boolean {
    const element = part.element as unknown as Record<string, unknown>;
    if (part.name in part.element && element[part.name] !== value) element[part.name] = value;
    return value;
  }
}

export const liveBoolean = directive(LiveBoolean);
