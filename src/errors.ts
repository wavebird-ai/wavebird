/**
 * Known SDK error codes.
 *
 * Consumers can use these codes in the `onError` callback
 * to react to specific failure classes programmatically.
 */
export const WavebirdSdkErrorCode = {
  /** Server responded with an HTTP error status. */
  HTTP_ERROR: "sdk_http_error",
  /** Network request failed due to transport problems such as DNS, offline, or timeouts. */
  NETWORK_ERROR: "sdk_network_error",
  /** Decision polling exceeded the configured timeout budget. */
  DECISION_TIMEOUT: "sdk_decision_timeout",
  /** WebSocket connection closed before a decision was delivered. */
  WS_CLOSED: "sdk_ws_closed",
  /** WebSocket connection could not be established. */
  WS_CONNECT_FAILED: "sdk_ws_connect_failed",
  /** A response body could not be parsed as JSON. */
  PARSE_ERROR: "sdk_parse_error",
  /** Browser-side human verification requirements were not satisfied. */
  VERIFICATION_REQUIRED: "sdk_verification_required",
  /** Internal SDK error. */
  INTERNAL: "sdk_internal",
} as const;

/**
 * Union of all machine-readable SDK error codes.
 */
export type WavebirdSdkErrorCode = (typeof WavebirdSdkErrorCode)[keyof typeof WavebirdSdkErrorCode];

/**
 * Structured SDK error delivered through `onError`.
 *
 * The SDK remains fail-silent and never throws this error to callers.
 * Instances are only emitted through callback-based error observation.
 */
export class WavebirdSdkError extends Error {
  public readonly code: WavebirdSdkErrorCode;
  public readonly cause?: unknown;

  constructor(code: WavebirdSdkErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "WavebirdSdkError";
    this.code = code;
    this.cause = options?.cause;
  }
}
