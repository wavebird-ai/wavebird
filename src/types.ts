import type {
  CslWrapperDecisionFillV1,
  CslWrapperDecisionNoFillV1,
  CslWrapperDecisionPendingV1,
  CslWrapperBeaconRequestV1,
  CslWrapperBeaconResponseV1,
  CslWrapperGenerationEventRequestV1,
  CslWrapperIngressAcceptedResponseV1,
  CslWrapperIngressCreateRequestV1,
  PublicConsentFlags,
  PublicDecisionDeliveryMode,
} from "./public_contracts/index.js";

/**
 * Consent flags forwarded to the public wrapper contract.
 */
export type ConsentFlags = PublicConsentFlags;

export type WavebirdTimingMode = "during" | "before" | "after";

export type WavebirdFrequencyCap = {
  session?: number;
  prompt_interval?: number;
  global_per_hour?: number;
  user_per_day?: number;
};

export type WavebirdTargetingConfig = {
  countries?: string[];
  regions?: string[];
  cities?: string[];
  device_types?: Array<"desktop" | "mobile" | "tablet">;
  os?: string[];
  browsers?: string[];
};

export type WavebirdPacingConfig = {
  daily_budget?: number;
  monthly_budget?: number;
  strategy?: "even" | "asap";
  timezone?: string;
  dayparting_hours?: number[];
  dayparting_days?: number[];
};

export type WavebirdBidfloorsConfig = {
  default?: number;
  banner?: number;
  clip?: number;
  native?: number;
};

export type WavebirdDecisionMetadata = {
  timing: WavebirdTimingMode;
  inference: {
    estimated_window_ms: number | null;
    max_creative_duration_ms: number | null;
    fallback_mode: "banner" | null;
    allowed_modes: Array<"banner" | "clip" | "native">;
  };
};

/**
 * SDK convenience input for the public wrapper ingress request.
 *
 * The SDK keeps a flattened shape for common integration flows while preserving
 * field-level types from the shared public contracts.
 */
export type JobRequest = {
  job_type: CslWrapperIngressCreateRequestV1["job"]["job_type"];
  slots_requested?: CslWrapperIngressCreateRequestV1["job"]["slots_requested"];
  model_id?: CslWrapperIngressCreateRequestV1["job"]["model_id"];
  locale?: CslWrapperIngressCreateRequestV1["job"]["locale"];
  predicted_latency_ms?: NonNullable<CslWrapperIngressCreateRequestV1["latency_hint"]>["predicted_latency_ms"];
  client_id?: NonNullable<CslWrapperIngressCreateRequestV1["context"]>["client_id"];
  chat_session_id?: NonNullable<CslWrapperIngressCreateRequestV1["context"]>["chat_session_id"];
  prompt?: CslWrapperIngressCreateRequestV1["prompt"];
  context?: Pick<NonNullable<CslWrapperIngressCreateRequestV1["context"]>, "topic" | "prompt_text" | "geo" | "device">;
  consent?: ConsentFlags;
  ssp_partner_id?: NonNullable<CslWrapperIngressCreateRequestV1["routing_hint"]>["preferred_partner_id"];
  routing?: {
    preferred_partner_id?: NonNullable<CslWrapperIngressCreateRequestV1["routing_hint"]>["preferred_partner_id"];
    candidate_partner_ids?: NonNullable<CslWrapperIngressCreateRequestV1["routing_hint"]>["candidate_partner_ids"];
  };
  callback_url?: NonNullable<CslWrapperIngressCreateRequestV1["delivery"]>["callback_url"];
  publisher?: CslWrapperIngressCreateRequestV1["publisher"];
  slot_config?: CslWrapperIngressCreateRequestV1["slot_config"] & {
    timing?: WavebirdTimingMode;
    bidfloors?: WavebirdBidfloorsConfig;
  };
  brand_safety?: CslWrapperIngressCreateRequestV1["brand_safety"];
  verification?: CslWrapperIngressCreateRequestV1["verification"];
  timing?: WavebirdTimingMode;
  frequency_cap?: WavebirdFrequencyCap;
  targeting?: WavebirdTargetingConfig;
  pacing?: WavebirdPacingConfig;
};

/**
 * Decision delivery strategy exposed by the SDK.
 */
export type DecisionDeliveryMode = PublicDecisionDeliveryMode | "auto";

/**
 * Accepted job metadata returned by `createJob`.
 */
export type AcceptedJobResponse = Pick<CslWrapperIngressAcceptedResponseV1, "job_id" | "slot_ids" | "status">;

/**
 * Rate-limit result returned by `createJob` when the key-level request budget is exceeded.
 */
export type RateLimitedJobResponse = {
  error: "rate_limit_exceeded";
  retry_after_ms: number;
};

/**
 * Public `createJob` return type.
 */
export type JobResponse = AcceptedJobResponse | RateLimitedJobResponse;

/**
 * Normalized decision state returned by `getDecision`.
 */
export type DecisionResponse =
  | (Pick<CslWrapperDecisionPendingV1, "slot_id" | "status" | "fill"> & { metadata?: WavebirdDecisionMetadata })
  | (Pick<CslWrapperDecisionNoFillV1, "slot_id" | "status" | "fill" | "reason" | "no_fill_reason" | "cs_declaration"> & {
      metadata?: WavebirdDecisionMetadata;
    })
  | (Pick<
      CslWrapperDecisionFillV1,
      "slot_id" | "status" | "fill" | "creative" | "asset_token" | "constraints" | "cs_declaration" | "revenue_estimate"
    > & { metadata?: WavebirdDecisionMetadata });

/**
 * Wrapper-friendly placement shape returned by the canonical Server API and
 * by `normalizeWavebirdPlacement`.
 */
export type WavebirdPlacement = {
  image_url: string | null;
  video_url?: string;
  click_url: string | null;
  sponsor_name: string | null;
  width: number;
  height: number;
  format: "banner" | "clip" | "native";
  asset_token: string;
  ad_label_text: string;
  render?: {
    strategy: "hosted_frame";
    frame_url: string;
    script_url: string;
    media_type: "image" | "video" | "native";
    width: number;
    height: number;
    aspect_ratio: string;
    label_text: string;
    sponsor_name: string | null;
    click_url: string | null;
    native_template_id?: "card" | "list_item" | "featured" | "minimal";
  };
};

/**
 * Generation lifecycle event names accepted by `reportGeneration`.
 */
export type GenerationEvent = CslWrapperGenerationEventRequestV1["generation_event"];

/**
 * Optional generation metadata sent to the wrapper generation endpoint.
 */
export type GenerationRequest = Omit<CslWrapperGenerationEventRequestV1, "contract_version" | "generation_event">;

/**
 * Beacon payload accepted by `sendBeacon`.
 */
export type BeaconRequest = Omit<CslWrapperBeaconRequestV1, "contract_version"> & {
  /** Optional slot identifier used by the canonical v1 beacon endpoint. */
  slot_id?: string;
};

/**
 * Beacon acknowledgement returned by `sendBeacon`.
 */
export type BeaconResponse = Omit<CslWrapperBeaconResponseV1, "contract_version">;
