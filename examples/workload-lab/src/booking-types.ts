export type Viewer = 'guest' | 'member';
export interface Row {
  readonly id: string;
  readonly title: string;
  readonly quantity: number;
  readonly version: number;
  readonly privateNote?: string;
}
export interface Snapshot {
  readonly revision: number;
  readonly rows: readonly Row[];
}
export interface Draft {
  readonly quantity: number;
  readonly confirmed: boolean;
  readonly baseVersion: number;
}
export interface Write {
  readonly viewer: Viewer;
  readonly id: string;
  readonly quantity: number;
  readonly baseVersion: number;
  readonly key: string;
}
export interface Pending extends Write {
  readonly operation: number;
  readonly attempt: number;
  readonly phase: 'key' | 'write' | 'failed' | 'committed' | 'reload-failed' | 'done';
  readonly revision: number | undefined;
}
export interface State {
  readonly viewer: Viewer;
  readonly generation: number;
  readonly revision: number;
  readonly rows: readonly Row[];
  readonly drafts: Readonly<Record<string, Draft>>;
  readonly operation: number;
  readonly pending: Pending | undefined;
  readonly notice: string;
}
export type Msg =
  | { readonly _tag: 'Viewer'; readonly viewer: Viewer }
  | { readonly _tag: 'Snapshot'; readonly generation: number; readonly snapshot: Snapshot }
  | {
      readonly _tag: 'Draft';
      readonly id: string;
      readonly quantity?: number;
      readonly confirmed?: boolean;
    }
  | {
      readonly _tag: 'Save';
      readonly id: string;
      readonly quantity: number;
      readonly confirmed: boolean;
    }
  | {
      readonly _tag: 'Key';
      readonly generation: number;
      readonly operation: number;
      readonly key: string;
    }
  | {
      readonly _tag: 'Committed';
      readonly generation: number;
      readonly operation: number;
      readonly revision: number;
    }
  | {
      readonly _tag: 'Failed';
      readonly generation: number;
      readonly operation: number;
      readonly reload: boolean;
      readonly error: string;
    }
  | { readonly _tag: 'Retry' };
