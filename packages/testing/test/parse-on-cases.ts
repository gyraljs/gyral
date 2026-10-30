// parse() on on() parsers (gyral-cd0): the event defaults to the parser's declared type, the key
// filter reads the input's `key`, `modifiers` sets the keys held, and without a target the DOM
// fields are undefined instead of throwing. Run in Node with no DOM (parse-on.node.test.ts) and
// in the browser (parse-on.test.ts): a test gets the same results in both.
import { describe, expect, it } from 'vitest';
import { define, html, on } from '@gyral/core';
import { parse } from '../src/index.js';

type Msg =
  | { readonly _tag: 'Submit' }
  | { readonly _tag: 'Save'; readonly ctrl: boolean }
  | { readonly _tag: 'Move'; readonly by: number }
  | { readonly _tag: 'Level'; readonly level: number | undefined; readonly bare: boolean }
  | { readonly _tag: 'Point' };

const Editor = define<{ readonly n: number }, Msg>()('test-parse-on', {
  init: () => ({ n: 0 }),
  intent: {
    Submit: on('keydown', { keys: ['Enter'] }, () => ({ _tag: 'Submit' })),
    Save: on('keydown', { keys: ['s'], modifiers: { ctrl: true } }, (input) => ({
      _tag: 'Save',
      ctrl: input.event.ctrlKey,
    })),
    Move: on('keydown', { keys: ['ArrowLeft', 'ArrowRight'], modifiers: 'none' }, (input) => ({
      _tag: 'Move',
      by: input.event.key === 'ArrowLeft' ? -1 : 1,
    })),
    Level: on('input', (input) => ({
      _tag: 'Level',
      level: input.valueAsNumber,
      bare: input.control === undefined && input.form === undefined && input.origin === undefined,
    })),
    Point: on('click', (input) => (input.files === undefined ? { _tag: 'Point' } : undefined)),
  },
  update: {
    Submit: (s) => s,
    Save: (s) => s,
    Move: (s) => s,
    Level: (s) => s,
    Point: (s) => s,
  },
  view: (_s, i) => html`
    <input data-intent-keydown=${i.Submit} />
    <div tabindex="0" data-intent-keydown=${i.Save}></div>
    <div tabindex="0" data-intent-keydown=${i.Move}></div>
    <input type="range" data-intent-input=${i.Level} />
    <button type="button" data-intent=${i.Point}>go</button>
  `,
});

/** The cases, in a `describe` named for `where` they run. */
export function parseOnCases(where: string): void {
  describe(`parse() on on() parsers, ${where}`, () => {
    it("gives the parser an event of its declared type, and filters on the input's key", () => {
      expect(parse(Editor, 'Submit', { key: 'Enter' })).toEqual({ _tag: 'Submit' });
      expect(parse(Editor, 'Submit', { key: 'Escape' })).toBeUndefined();
      expect(parse(Editor, 'Submit')).toBeUndefined();
      // The input's key wins over an event of your own that carries none.
      expect(parse(Editor, 'Submit', { key: 'Enter', event: new Event('keydown') })).toEqual({
        _tag: 'Submit',
      });
      // The event it creates carries the key too, for parsers that read `input.event.key`.
      expect(parse(Editor, 'Move', { key: 'ArrowLeft' })).toEqual({ _tag: 'Move', by: -1 });
      expect(parse(Editor, 'Point')).toEqual({ _tag: 'Point' });
    });

    it('holds the modifier keys you name, and none by default', () => {
      expect(parse(Editor, 'Save', { key: 's' })).toBeUndefined();
      expect(parse(Editor, 'Save', { key: 's', modifiers: { ctrl: true } })).toEqual({
        _tag: 'Save',
        ctrl: true,
      });
      expect(parse(Editor, 'Move', { key: 'ArrowRight' })).toEqual({ _tag: 'Move', by: 1 });
      expect(parse(Editor, 'Move', { key: 'ArrowRight', modifiers: { shift: true } })).toBe(
        undefined,
      );
      // Modifiers go on the event parse() creates; your own event carries its own.
      expect(() =>
        parse(Editor, 'Save', { key: 's', modifiers: { ctrl: true }, event: new Event('keydown') }),
      ).toThrow('modifiers');
      const held = Object.assign(new Event('keydown'), { ctrlKey: true });
      expect(parse(Editor, 'Save', { key: 's', event: held })).toEqual({
        _tag: 'Save',
        ctrl: true,
      });
    });

    it('reads valueAsNumber from `value`; control, form and origin are undefined', () => {
      expect(parse(Editor, 'Level', { value: '7' })).toEqual({
        _tag: 'Level',
        level: 7,
        bare: true,
      });
      expect(parse(Editor, 'Level', { value: '' })).toEqual({
        _tag: 'Level',
        level: undefined,
        bare: true,
      });
      expect(parse(Editor, 'Level', { value: 'seven' })).toEqual({
        _tag: 'Level',
        level: undefined,
        bare: true,
      });
    });

    it('tolerates a plain-object target and an event without composedPath()', () => {
      const target = { tagName: 'DIV' } as unknown as Element;
      const event = { type: 'input' } as Event;
      expect(parse(Editor, 'Level', { value: '3', target, event })).toEqual({
        _tag: 'Level',
        level: undefined,
        bare: true,
      });
    });

    it('still says when another event type reaches an on() parser', () => {
      expect(() => parse(Editor, 'Submit', { key: 'Enter', event: new Event('click') })).toThrow(
        'is on("keydown"), but a "click" event reached it',
      );
    });
  });
}
