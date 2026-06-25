import {
  type PublicConsentFlags,
  type PublicContractVersion,
  type PublicDecisionDeliveryMode,
  type PublicNativeCreativeAssets,
  type PublicSlotMode,
  type PublicVerificationSignals,
  type PublicVastTrackingSet,
  isPublicConsentFlags,
  isPublicContractVersion,
  isPublicDecisionDeliveryMode,
  isPublicNativeCreativeAssets,
  isPublicSlotMode,
  isPublicVerificationSignals,
  isPublicVastTrackingSet,
} from "./common.js";

/**
 * Contract version for wrapper ingress create requests.
 */
export const WRAPPER_INGRESS_CREATE_CONTRACT_VERSION = "csl_wrapper_ingress_create/v1" as const;
/**
 * Contract version for accepted wrapper ingress responses.
 */
export const WRAPPER_INGRESS_ACCEPTED_CONTRACT_VERSION = "csl_wrapper_ingress_accepted/v1" as const;
/**
 * Contract version for wrapper decision responses.
 */
export const WRAPPER_DECISION_CONTRACT_VERSION = "csl_wrapper_decision/v1" as const;
/**
 * Contract version for wrapper generation event requests.
 */
export const WRAPPER_GENERATION_EVENT_CONTRACT_VERSION = "csl_wrapper_generation_event/v1" as const;
/**
 * Contract version for wrapper beacon requests and responses.
 */
export const WRAPPER_BEACON_CONTRACT_VERSION = "csl_wrapper_beacon/v1" as const;

/**
 * Literal contract version type for wrapper ingress create requests.
 */
export type WrapperIngressCreateContractVersion = typeof WRAPPER_INGRESS_CREATE_CONTRACT_VERSION;
/**
 * Literal contract version type for accepted wrapper ingress responses.
 */
export type WrapperIngressAcceptedContractVersion = typeof WRAPPER_INGRESS_ACCEPTED_CONTRACT_VERSION;
/**
 * Literal contract version type for wrapper decision responses.
 */
export type WrapperDecisionContractVersion = typeof WRAPPER_DECISION_CONTRACT_VERSION;
/**
 * Literal contract version type for wrapper generation event requests.
 */
export type WrapperGenerationEventContractVersion = typeof WRAPPER_GENERATION_EVENT_CONTRACT_VERSION;
/**
 * Literal contract version type for wrapper beacon messages.
 */
export type WrapperBeaconContractVersion = typeof WRAPPER_BEACON_CONTRACT_VERSION;

/**
 * Prompt payload accepted by wrapper ingress requests.
 */
export type CslWrapperPromptV1 = {
  text?: string;
  token_count_estimate?: number;
};

/**
 * Optional wrapper context identifiers forwarded to wavebird.
 */
export type CslWrapperContextV1 = {
  client_id?: string;
  chat_session_id?: string;
  topic?: string;
  prompt_text?: string;
  geo?: {
    country?: string;
    region?: string;
    city?: string;
  };
  device?: {
    type?: "desktop" | "mobile" | "tablet";
    os?: string;
    browser?: string;
  };
};

/**
 * Optional publisher metadata forwarded with wrapper requests.
 */
export type CslWrapperPublisherV1 = {
  app_name?: string;
  app_domain?: string;
  app_bundle?: string;
  categories?: string[];
};

/**
 * Optional slot-level placement preferences forwarded with wrapper requests.
 */
export type CslWrapperSlotConfigV1 = {
  allowed_formats?: PublicSlotMode[];
  max_width?: number;
  max_height?: number;
  position_hint?: "above" | "below" | "sidebar" | "between";
  native_template_id?: "card" | "list_item" | "list-item" | "featured" | "minimal";
  bidfloor?: number;
  bidfloorcur?: string;
  timing?: "during" | "before" | "after";
  bidfloors?: {
    default?: number;
    banner?: number;
    clip?: number;
    native?: number;
  };
};

export type CslWrapperFrequencyCapV1 = {
  session?: number;
  prompt_interval?: number;
  global_per_hour?: number;
  user_per_day?: number;
};

export type CslWrapperTargetingV1 = {
  countries?: string[];
  regions?: string[];
  cities?: string[];
  device_types?: Array<"desktop" | "mobile" | "tablet">;
  os?: string[];
  browsers?: string[];
};

export type CslWrapperPacingV1 = {
  daily_budget?: number;
  monthly_budget?: number;
  strategy?: "even" | "asap";
  timezone?: string;
  dayparting_hours?: number[];
  dayparting_days?: number[];
};

export type CslWrapperDecisionMetadataV1 = {
  timing: "during" | "before" | "after";
  inference: {
    estimated_window_ms: number | null;
    max_creative_duration_ms: number | null;
    fallback_mode: "banner" | null;
    allowed_modes: PublicSlotMode[];
  };
};

/**
 * Optional brand-safety preferences forwarded with wrapper requests.
 */
export type CslWrapperBrandSafetyV1 = {
  blocked_categories?: string[];
  blocked_domains?: string[];
};

/**
 * Optional routing hint supplied by the wrapper.
 */
export type CslWrapperRoutingHintV1 = {
  preferred_partner_id?: string;
  candidate_partner_ids?: string[];
};

/**
 * Decision delivery preferences requested by the wrapper.
 */
export type CslWrapperDeliveryV1 = {
  mode: PublicDecisionDeliveryMode;
  callback_url?: string | null;
};

/**
 * Public wrapper ingress request.
 */
export type CslWrapperIngressCreateRequestV1 = {
  contract_version: WrapperIngressCreateContractVersion;
  job: {
    job_type: string;
    model_id?: string;
    locale?: string;
    slots_requested?: number;
  };
  prompt?: CslWrapperPromptV1 | string;
  consent?: PublicConsentFlags;
  context?: CslWrapperContextV1;
  publisher?: CslWrapperPublisherV1;
  slot_config?: CslWrapperSlotConfigV1;
  brand_safety?: CslWrapperBrandSafetyV1;
  latency_hint?: {
    predicted_latency_ms?: number;
  };
  verification?: PublicVerificationSignals;
  routing_hint?: CslWrapperRoutingHintV1;
  delivery?: CslWrapperDeliveryV1;
  frequency_cap?: CslWrapperFrequencyCapV1;
  targeting?: CslWrapperTargetingV1;
  pacing?: CslWrapperPacingV1;
};

/**
 * Accepted wrapper ingress response.
 */
export type CslWrapperIngressAcceptedResponseV1 = {
  contract_version: WrapperIngressAcceptedContractVersion;
  job_id: string;
  slot_ids: string[];
  status: "accepted";
  decision_delivery: {
    mode: PublicDecisionDeliveryMode;
    decision_path_template: string | null;
  };
};

/**
 * Pending wrapper decision response.
 */
export type CslWrapperDecisionPendingV1 = {
  contract_version: WrapperDecisionContractVersion;
  slot_id: string;
  status: "pending";
  fill: null;
  reason: null;
  no_fill_reason: null;
  creative: null;
  asset_token: null;
  constraints: null;
  cs_declaration: null;
  revenue_estimate: null;
  metadata?: CslWrapperDecisionMetadataV1;
};

/**
 * Ready wrapper decision response that contains no fill.
 */
export type CslWrapperDecisionNoFillV1 = {
  contract_version: WrapperDecisionContractVersion;
  slot_id: string;
  status: "ready";
  fill: false;
  reason: string;
  no_fill_reason: string;
  creative: null;
  asset_token: null;
  constraints: null;
  cs_declaration: string;
  revenue_estimate: null;
  metadata?: CslWrapperDecisionMetadataV1;
};

/**
 * Ready wrapper decision response that contains a creative fill.
 */
export type CslWrapperDecisionFillV1 = {
  contract_version: WrapperDecisionContractVersion;
  slot_id: string;
  status: "ready";
  fill: true;
  reason: null;
  no_fill_reason: null;
  creative: {
    url: string;
    type: PublicSlotMode;
    duration_ms: number;
    width: number;
    height: number;
    mime_type?: string;
    click_through_url?: string;
    vast_tracking?: PublicVastTrackingSet;
    sponsor_name?: string;
    native_assets?: PublicNativeCreativeAssets;
  };
  asset_token: string;
  constraints: Record<string, unknown>;
  cs_declaration: string;
  revenue_estimate?: {
    gross_cpm?: number;
    estimated_net_per_impression?: number;
    currency?: string;
  } | null;
  metadata?: CslWrapperDecisionMetadataV1;
};

/**
 * Union of all wrapper decision response variants.
 */
export type CslWrapperDecisionResponseV1 =
  | CslWrapperDecisionPendingV1
  | CslWrapperDecisionNoFillV1
  | CslWrapperDecisionFillV1;

/**
 * Supported generation lifecycle event names.
 */
export const WRAPPER_GENERATION_EVENTS = ["started", "finished", "failed"] as const;
/**
 * Union of supported generation lifecycle event names.
 */
export type CslWrapperGenerationEventNameV1 = (typeof WRAPPER_GENERATION_EVENTS)[number];

/**
 * Wrapper generation lifecycle event request.
 */
export type CslWrapperGenerationEventRequestV1 = {
  contract_version: WrapperGenerationEventContractVersion;
  generation_event: CslWrapperGenerationEventNameV1;
  generation_id?: string;
  model_id?: string;
  usage_json?: unknown;
  error?: string;
};

/**
 * Supported beacon types accepted by the wrapper beacon endpoint.
 */
export const WRAPPER_BEACON_TYPES = [
  "rendered",
  "on_view",
  "visible_started",
  "visible_ended",
  "heartbeat",
  "play_started",
  "play_completed",
  "clicked",
] as const;
/**
 * Union of supported wrapper beacon types.
 */
export type CslWrapperBeaconTypeV1 = (typeof WRAPPER_BEACON_TYPES)[number];

/**
 * Wrapper beacon request payload.
 */
export type CslWrapperBeaconRequestV1 = {
  contract_version: WrapperBeaconContractVersion;
  beacon_id: string;
  asset_token: string;
  beacon_type: CslWrapperBeaconTypeV1;
  occurred_at_ms_client: number;
  measurements?: Record<string, unknown>;
};

/**
 * Wrapper beacon acknowledgement payload.
 */
export type CslWrapperBeaconResponseV1 = {
  contract_version: WrapperBeaconContractVersion;
  accepted: boolean;
  reason_code: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalLooseString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isNonEmptyString(value);
}

function isOptionalPositiveNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isOptionalIntegerAtLeastOne(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 1);
}

function isOptionalRecord(value: unknown): value is Record<string, unknown> | undefined {
  return value === undefined || isRecord(value);
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isOptionalIntegerArrayInRange(value: unknown, min: number, max: number): value is number[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => Number.isInteger(entry) && entry >= min && entry <= max))
  );
}

function isTimingMode(value: unknown): value is "during" | "before" | "after" {
  return value === "during" || value === "before" || value === "after";
}

function isOptionalDeviceTypeArray(value: unknown): value is Array<"desktop" | "mobile" | "tablet"> | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => entry === "desktop" || entry === "mobile" || entry === "tablet"))
  );
}

function isDecisionMetadata(value: unknown): value is CslWrapperDecisionMetadataV1 {
  if (!isRecord(value) || !isTimingMode(value["timing"])) {
    return false;
  }
  const inference = isRecord(value["inference"]) ? value["inference"] : null;
  return (
    inference !== null &&
    (inference["estimated_window_ms"] === null ||
      (typeof inference["estimated_window_ms"] === "number" && Number.isFinite(inference["estimated_window_ms"]))) &&
    (inference["max_creative_duration_ms"] === null ||
      (typeof inference["max_creative_duration_ms"] === "number" &&
        Number.isFinite(inference["max_creative_duration_ms"]))) &&
    (inference["fallback_mode"] === null || inference["fallback_mode"] === "banner") &&
    Array.isArray(inference["allowed_modes"]) &&
    inference["allowed_modes"].every((mode) => isPublicSlotMode(mode))
  );
}

function isPromptPayload(value: unknown): value is CslWrapperPromptV1 | string {
  if (typeof value === "string") {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return (value["text"] === undefined || typeof value["text"] === "string") && isOptionalPositiveNumber(value["token_count_estimate"]);
}

/**
 * Checks whether a value is a wrapper contract version string.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value belongs to the `csl_wrapper_*` contract family.
 */
export function isWrapperContractVersion(value: unknown): value is PublicContractVersion {
  return isPublicContractVersion(value) && value.startsWith("csl_wrapper_");
}

/**
 * Validates a wrapper ingress create request payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslWrapperIngressCreateRequestV1`.
 */
export function isCslWrapperIngressCreateRequestV1(value: unknown): value is CslWrapperIngressCreateRequestV1 {
  if (!isRecord(value) || value["contract_version"] !== WRAPPER_INGRESS_CREATE_CONTRACT_VERSION) {
    return false;
  }
  const job = isRecord(value["job"]) ? value["job"] : null;
  const context = value["context"] === undefined ? null : isRecord(value["context"]) ? value["context"] : null;
  const publisher = value["publisher"] === undefined ? null : isRecord(value["publisher"]) ? value["publisher"] : null;
  const slotConfig =
    value["slot_config"] === undefined ? null : isRecord(value["slot_config"]) ? value["slot_config"] : null;
  const brandSafety =
    value["brand_safety"] === undefined ? null : isRecord(value["brand_safety"]) ? value["brand_safety"] : null;
  const latencyHint =
    value["latency_hint"] === undefined ? null : isRecord(value["latency_hint"]) ? value["latency_hint"] : null;
  const routingHint =
    value["routing_hint"] === undefined ? null : isRecord(value["routing_hint"]) ? value["routing_hint"] : null;
  const delivery = value["delivery"] === undefined ? null : isRecord(value["delivery"]) ? value["delivery"] : null;
  const frequencyCap =
    value["frequency_cap"] === undefined ? null : isRecord(value["frequency_cap"]) ? value["frequency_cap"] : null;
  const targeting = value["targeting"] === undefined ? null : isRecord(value["targeting"]) ? value["targeting"] : null;
  const pacing = value["pacing"] === undefined ? null : isRecord(value["pacing"]) ? value["pacing"] : null;
  const contextGeo = context?.["geo"] === undefined ? null : isRecord(context["geo"]) ? context["geo"] : null;
  const contextDevice = context?.["device"] === undefined ? null : isRecord(context["device"]) ? context["device"] : null;
  const slotBidfloors =
    slotConfig?.["bidfloors"] === undefined ? null : isRecord(slotConfig["bidfloors"]) ? slotConfig["bidfloors"] : null;
  return (
    job !== null &&
    isNonEmptyString(job["job_type"]) &&
    isOptionalLooseString(job["model_id"]) &&
    isOptionalLooseString(job["locale"]) &&
    isOptionalIntegerAtLeastOne(job["slots_requested"]) &&
    (value["prompt"] === undefined || isPromptPayload(value["prompt"])) &&
    (value["consent"] === undefined || isPublicConsentFlags(value["consent"])) &&
    (value["verification"] === undefined || isPublicVerificationSignals(value["verification"])) &&
    (context === null ||
      (isOptionalString(context["client_id"]) &&
        isOptionalString(context["chat_session_id"]) &&
        isOptionalLooseString(context["topic"]) &&
        isOptionalLooseString(context["prompt_text"]) &&
        (context["geo"] === undefined ||
          (contextGeo !== null &&
            isOptionalLooseString(contextGeo["country"]) &&
            isOptionalLooseString(contextGeo["region"]) &&
            isOptionalLooseString(contextGeo["city"]))) &&
        (context["device"] === undefined ||
          (contextDevice !== null &&
            (contextDevice["type"] === undefined ||
              contextDevice["type"] === "desktop" ||
              contextDevice["type"] === "mobile" ||
              contextDevice["type"] === "tablet") &&
            isOptionalLooseString(contextDevice["os"]) &&
            isOptionalLooseString(contextDevice["browser"]))))) &&
    (publisher === null ||
      (isOptionalString(publisher["app_name"]) &&
        isOptionalString(publisher["app_domain"]) &&
        isOptionalString(publisher["app_bundle"]) &&
        isOptionalStringArray(publisher["categories"]))) &&
    (slotConfig === null ||
      ((slotConfig["allowed_formats"] === undefined ||
        (Array.isArray(slotConfig["allowed_formats"]) &&
          slotConfig["allowed_formats"].length > 0 &&
          slotConfig["allowed_formats"].every((format) => isPublicSlotMode(format)))) &&
        isOptionalPositiveNumber(slotConfig["max_width"]) &&
        isOptionalPositiveNumber(slotConfig["max_height"]) &&
        (slotConfig["position_hint"] === undefined ||
          slotConfig["position_hint"] === "above" ||
          slotConfig["position_hint"] === "below" ||
          slotConfig["position_hint"] === "sidebar" ||
          slotConfig["position_hint"] === "between") &&
        (slotConfig["native_template_id"] === undefined ||
          slotConfig["native_template_id"] === "card" ||
          slotConfig["native_template_id"] === "list_item" ||
          slotConfig["native_template_id"] === "list-item" ||
          slotConfig["native_template_id"] === "featured" ||
          slotConfig["native_template_id"] === "minimal") &&
        isOptionalPositiveNumber(slotConfig["bidfloor"]) &&
        isOptionalString(slotConfig["bidfloorcur"]) &&
        (slotConfig["timing"] === undefined || isTimingMode(slotConfig["timing"])) &&
        (slotConfig["bidfloors"] === undefined ||
          (slotBidfloors !== null &&
            isOptionalPositiveNumber(slotBidfloors["default"]) &&
            isOptionalPositiveNumber(slotBidfloors["banner"]) &&
            isOptionalPositiveNumber(slotBidfloors["clip"]) &&
            isOptionalPositiveNumber(slotBidfloors["native"]))))) &&
    (brandSafety === null ||
      (isOptionalStringArray(brandSafety["blocked_categories"]) &&
        isOptionalStringArray(brandSafety["blocked_domains"]))) &&
    (latencyHint === null || isOptionalPositiveNumber(latencyHint["predicted_latency_ms"])) &&
    (routingHint === null ||
      (isOptionalString(routingHint["preferred_partner_id"]) &&
        (routingHint["candidate_partner_ids"] === undefined || isStringArray(routingHint["candidate_partner_ids"])))) &&
    (delivery === null ||
      (isPublicDecisionDeliveryMode(delivery["mode"]) && isOptionalNullableString(delivery["callback_url"]))) &&
    (value["frequency_cap"] === undefined ||
      (frequencyCap !== null &&
        isOptionalIntegerAtLeastOne(frequencyCap["session"]) &&
        isOptionalIntegerAtLeastOne(frequencyCap["prompt_interval"]) &&
        isOptionalIntegerAtLeastOne(frequencyCap["global_per_hour"]) &&
        isOptionalIntegerAtLeastOne(frequencyCap["user_per_day"]))) &&
    (value["targeting"] === undefined ||
      (targeting !== null &&
        isOptionalStringArray(targeting["countries"]) &&
        isOptionalStringArray(targeting["regions"]) &&
        isOptionalStringArray(targeting["cities"]) &&
        isOptionalDeviceTypeArray(targeting["device_types"]) &&
        isOptionalStringArray(targeting["os"]) &&
        isOptionalStringArray(targeting["browsers"]))) &&
    (value["pacing"] === undefined ||
      (pacing !== null &&
        isOptionalPositiveNumber(pacing["daily_budget"]) &&
        isOptionalPositiveNumber(pacing["monthly_budget"]) &&
        (pacing["strategy"] === undefined || pacing["strategy"] === "even" || pacing["strategy"] === "asap") &&
        isOptionalString(pacing["timezone"]) &&
        isOptionalIntegerArrayInRange(pacing["dayparting_hours"], 0, 23) &&
        isOptionalIntegerArrayInRange(pacing["dayparting_days"], 0, 6)))
  );
}

/**
 * Validates an accepted wrapper ingress response payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslWrapperIngressAcceptedResponseV1`.
 */
export function isCslWrapperIngressAcceptedResponseV1(value: unknown): value is CslWrapperIngressAcceptedResponseV1 {
  if (!isRecord(value) || value["contract_version"] !== WRAPPER_INGRESS_ACCEPTED_CONTRACT_VERSION) {
    return false;
  }
  const decisionDelivery = isRecord(value["decision_delivery"]) ? value["decision_delivery"] : null;
  return (
    isNonEmptyString(value["job_id"]) &&
    isStringArray(value["slot_ids"]) &&
    value["status"] === "accepted" &&
    decisionDelivery !== null &&
    isPublicDecisionDeliveryMode(decisionDelivery["mode"]) &&
    (decisionDelivery["decision_path_template"] === null || isNonEmptyString(decisionDelivery["decision_path_template"]))
  );
}

/**
 * Validates a wrapper decision response payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslWrapperDecisionResponseV1`.
 */
export function isCslWrapperDecisionResponseV1(value: unknown): value is CslWrapperDecisionResponseV1 {
  if (!isRecord(value) || value["contract_version"] !== WRAPPER_DECISION_CONTRACT_VERSION) {
    return false;
  }
  if (!isNonEmptyString(value["slot_id"])) {
    return false;
  }
  if (value["status"] === "pending") {
    return (
      value["fill"] === null &&
      value["reason"] === null &&
      value["no_fill_reason"] === null &&
      value["creative"] === null &&
      value["asset_token"] === null &&
      value["constraints"] === null &&
      value["cs_declaration"] === null &&
      value["revenue_estimate"] === null &&
      (value["metadata"] === undefined || isDecisionMetadata(value["metadata"]))
    );
  }
  if (value["status"] !== "ready") {
    return false;
  }
  if (value["fill"] === false) {
    return (
      isNonEmptyString(value["reason"]) &&
      isNonEmptyString(value["no_fill_reason"]) &&
      value["creative"] === null &&
      value["asset_token"] === null &&
      value["constraints"] === null &&
      isNonEmptyString(value["cs_declaration"]) &&
      value["revenue_estimate"] === null &&
      (value["metadata"] === undefined || isDecisionMetadata(value["metadata"]))
    );
  }
  if (value["fill"] !== true) {
    return false;
  }
  const creative = isRecord(value["creative"]) ? value["creative"] : null;
  const revenueEstimate = value["revenue_estimate"] === undefined ? null : value["revenue_estimate"];
  return (
    value["reason"] === null &&
    value["no_fill_reason"] === null &&
    creative !== null &&
    isNonEmptyString(creative["url"]) &&
    isPublicSlotMode(creative["type"]) &&
    typeof creative["duration_ms"] === "number" &&
    Number.isFinite(creative["duration_ms"]) &&
    typeof creative["width"] === "number" &&
    Number.isFinite(creative["width"]) &&
    typeof creative["height"] === "number" &&
    Number.isFinite(creative["height"]) &&
    isOptionalString(creative["mime_type"]) &&
    isOptionalString(creative["click_through_url"]) &&
    (creative["vast_tracking"] === undefined || isPublicVastTrackingSet(creative["vast_tracking"])) &&
    isOptionalString(creative["sponsor_name"]) &&
    (creative["native_assets"] === undefined || isPublicNativeCreativeAssets(creative["native_assets"])) &&
    isNonEmptyString(value["asset_token"]) &&
    isRecord(value["constraints"]) &&
    isNonEmptyString(value["cs_declaration"]) &&
    (revenueEstimate === null ||
      (isRecord(revenueEstimate) &&
        isOptionalPositiveNumber(revenueEstimate["gross_cpm"]) &&
        isOptionalPositiveNumber(revenueEstimate["estimated_net_per_impression"]) &&
        isOptionalString(revenueEstimate["currency"]))) &&
    (value["metadata"] === undefined || isDecisionMetadata(value["metadata"]))
  );
}

/**
 * Validates a wrapper generation lifecycle event payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslWrapperGenerationEventRequestV1`.
 */
export function isCslWrapperGenerationEventRequestV1(value: unknown): value is CslWrapperGenerationEventRequestV1 {
  if (!isRecord(value) || value["contract_version"] !== WRAPPER_GENERATION_EVENT_CONTRACT_VERSION) {
    return false;
  }
  return (
    typeof value["generation_event"] === "string" &&
    WRAPPER_GENERATION_EVENTS.includes(value["generation_event"] as CslWrapperGenerationEventNameV1) &&
    isOptionalString(value["generation_id"]) &&
    isOptionalString(value["model_id"]) &&
    (value["usage_json"] === undefined || true) &&
    (value["error"] === undefined || isNonEmptyString(value["error"]))
  );
}

/**
 * Validates a wrapper beacon request payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslWrapperBeaconRequestV1`.
 */
export function isCslWrapperBeaconRequestV1(value: unknown): value is CslWrapperBeaconRequestV1 {
  if (!isRecord(value) || value["contract_version"] !== WRAPPER_BEACON_CONTRACT_VERSION) {
    return false;
  }
  return (
    isNonEmptyString(value["beacon_id"]) &&
    isNonEmptyString(value["asset_token"]) &&
    typeof value["beacon_type"] === "string" &&
    WRAPPER_BEACON_TYPES.includes(value["beacon_type"] as CslWrapperBeaconTypeV1) &&
    typeof value["occurred_at_ms_client"] === "number" &&
    Number.isFinite(value["occurred_at_ms_client"]) &&
    (value["measurements"] === undefined || isRecord(value["measurements"]))
  );
}

/**
 * Validates a wrapper beacon response payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslWrapperBeaconResponseV1`.
 */
export function isCslWrapperBeaconResponseV1(value: unknown): value is CslWrapperBeaconResponseV1 {
  return (
    isRecord(value) &&
    value["contract_version"] === WRAPPER_BEACON_CONTRACT_VERSION &&
    typeof value["accepted"] === "boolean" &&
    isNonEmptyString(value["reason_code"])
  );
}
