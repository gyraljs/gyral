import type { StandardSchemaV1 } from '@standard-schema/spec';

export type WebSocketPayload = string | Blob | ArrayBuffer | ArrayBufferView<ArrayBuffer>;
export type WebSocketIncoming = string | ArrayBuffer;
export type WebSocketInput<T> =
  | {
      readonly _tag: 'Connect';
      readonly connection: string;
      readonly url: string;
      readonly protocols?: string | readonly string[];
    }
  | { readonly _tag: 'Send'; readonly connection: string; readonly value: T }
  | {
      readonly _tag: 'Close';
      readonly connection: string;
      readonly code?: number;
      readonly reason?: string;
    };
export interface WebSocketClosed {
  readonly _tag: 'WebSocketClosed';
  readonly connection: string;
  readonly url: string;
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;
  /** The application issued a valid Close command on this connection. */
  readonly requested: boolean;
}
export type WebSocketOutput<T> =
  | {
      readonly _tag: 'WebSocketState';
      readonly connection: string;
      readonly url: string;
      readonly state: 'connecting' | 'open' | 'closing';
    }
  | { readonly _tag: 'WebSocketMessage'; readonly connection: string; readonly data: T }
  | {
      readonly _tag: 'WebSocketDecodeFailed';
      readonly connection: string;
      readonly issues: readonly StandardSchemaV1.Issue[];
    }
  | { readonly _tag: 'WebSocketSent'; readonly connection: string; readonly bytes: number }
  | { readonly _tag: 'WebSocketCloseRequested'; readonly connection: string }
  | WebSocketClosed;
export type WebSocketError =
  | {
      readonly _tag: 'WebSocketConnectError';
      readonly connection: string | undefined;
      readonly url: string | undefined;
      readonly message: string;
    }
  | {
      readonly _tag: 'WebSocketClosedError';
      readonly connection: string;
      readonly url: string;
      readonly code: number;
      readonly reason: string;
      readonly wasClean: boolean;
      readonly errored: boolean;
      readonly requested: boolean;
    }
  | {
      readonly _tag: 'WebSocketSendError';
      readonly connection: string;
      readonly reason: 'not-open' | 'buffer-limit' | 'encode' | 'send';
      readonly message: string;
      readonly bufferedBytes?: number;
      readonly bytes?: number;
      readonly limit?: number;
    }
  | { readonly _tag: 'WebSocketCloseError'; readonly connection: string; readonly message: string };
export interface WebSocketOptions<T> {
  readonly name?: string;
  readonly encode: (value: T) => WebSocketPayload;
  /** Synchronous parse; default JSON text. Validation may be async. */
  readonly parse?: (payload: WebSocketIncoming) => unknown;
  /** Maximum native bufferedAmount + encoded payload bytes. Default 65536. */
  readonly maxBufferedBytes?: number;
}
