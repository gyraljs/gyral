import type { File, Node } from '@babel/types';
import type MagicString from 'magic-string';
import type { ModuleFacts } from '../facts.js';

/** What a transform sees of one file. Edits go to `edit`; positions are the original's. */
export interface TransformContext {
  /** The file's path relative to where the codemod runs, with `/` separators. */
  readonly path: string;
  readonly code: string;
  readonly ast: File;
  readonly facts: ModuleFacts;
  readonly edit: MagicString;
  /** Records a candidate left as is, at the node's line, with the reason. */
  readonly report: (node: Node, reason: string) => void;
}

export interface Transform {
  /** Short id shown in the report, e.g. `vite-plugin`. */
  readonly id: string;
  /** One line for `--help`. */
  readonly summary: string;
  run(context: TransformContext): void;
}
