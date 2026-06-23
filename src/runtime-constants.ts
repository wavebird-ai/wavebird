/**
 * Re-exports canonical public wrapper contract versions from the shared contract package.
 */
export {
  WRAPPER_BEACON_CONTRACT_VERSION,
  WRAPPER_DECISION_CONTRACT_VERSION,
  WRAPPER_GENERATION_EVENT_CONTRACT_VERSION,
  WRAPPER_INGRESS_ACCEPTED_CONTRACT_VERSION,
  WRAPPER_INGRESS_CREATE_CONTRACT_VERSION,
} from "./public_contracts.js";

/**
 * Default wrapper version string sent by the SDK when the caller does not override it.
 */
export const DEFAULT_WRAPPER_VERSION = "sdk" as const;

/**
 * Hostnames treated as local development targets by the SDK.
 */
export const LOCALHOST_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
