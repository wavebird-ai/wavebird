import { warnSdkDeprecation } from "./deprecation.js";
import { WavebirdSdkError as ExportedWavebirdSdkError, WavebirdSdkErrorCode as ExportedWavebirdSdkErrorCode } from "./errors.js";

warnSdkDeprecation(
  "sdkAdvancedCompatibility",
  "wavebird is now an advanced compatibility layer. For most integrations use the Wavebird Script Tag at https://wavebird.ai/wavebird.js or the REST API at https://api.wavebird.ai/v1/*. Deprecated helpers such as resolveAdTimingPlan remain exported for compatibility."
);

/** Node/server entrypoint for the CSL SDK package. */
export { WavebirdClient, type WavebirdClientOptions } from "./wavebird-client.js";
export { normalizeWavebirdPlacement } from "./placement.js";
export { resolveAdTimingPlan } from "./timing.js";

/** Structured SDK error delivered through `onError`. */
export const WavebirdSdkError = ExportedWavebirdSdkError;

/** Machine-readable SDK error codes. */
export const WavebirdSdkErrorCode = ExportedWavebirdSdkErrorCode;

/** Union of machine-readable SDK error codes. */
export type WavebirdSdkErrorCode = import("./errors.js").WavebirdSdkErrorCode;

export type {
  BeaconRequest,
  BeaconResponse,
  ConsentFlags,
  DecisionDeliveryMode,
  DecisionResponse,
  GenerationEvent,
  GenerationRequest,
  AcceptedJobResponse,
  JobRequest,
  JobResponse,
  RateLimitedJobResponse,
  WavebirdBidfloorsConfig,
  WavebirdDecisionMetadata,
  WavebirdPlacement,
  WavebirdFrequencyCap,
  WavebirdPacingConfig,
  WavebirdTargetingConfig,
  WavebirdTimingMode,
} from "./types.js";
export type { AdTimingMode, AdTimingPhase, AdTimingPlan } from "./timing.js";

export type { ConsentDecision, ConsentPurposes, StoredConsentRecord } from "./consent/consent-store.js";
