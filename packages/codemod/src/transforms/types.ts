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

/** One release's transforms, and the release they migrate from. */
export interface Release {
  /**
   * The oldest @gyral/core the transforms read: a module whose package's core is older is left
   * as is, and reported (../core-version.ts), since it must first be migrated this far.
   */
  readonly from: string;
  readonly transforms: readonly Transform[];
}

export interface Transform {
  /** Short id shown in the report, e.g. `vite-plugin`. */
  readonly id: string;
  /** One line for `--help`. */
  readonly summary: string;
  run(context: TransformContext): void;
}
