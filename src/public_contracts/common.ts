/**
 * Canonical version-string shape used by all public wavebird contracts.
 */
export type PublicContractVersion = `csl_${string}/v${number}`;

/**
 * Supported jurisdiction policy zones for Wavebird project defaults.
 */
export const PUBLIC_JURISDICTION_ZONES = [
  "eu_strict",
  "us_ccpa",
  "br_lgpd",
  "apac_strict",
  "rest_of_world",
] as const;

/**
 * Union of supported jurisdiction policy zones.
 */
export type PublicJurisdictionZone = (typeof PUBLIC_JURISDICTION_ZONES)[number];

/**
 * Optional per-project jurisdiction overrides layered on top of the zone defaults.
 */
export type PublicJurisdictionOverrides = {
  require_consent_collection?: boolean;
  enforce_ad_label?: boolean;
  ad_label_text?: string;
  gdpr_default?: boolean;
};

/**
 * Consent provenance labels used for auditing consent handling.
 */
export const PUBLIC_CONSENT_SOURCES = ["wrapper_cmp", "wavebird_consent", "none"] as const;

/**
 * Union of supported consent provenance labels.
 */
export type PublicConsentSource = (typeof PUBLIC_CONSENT_SOURCES)[number];

/**
 * Consent flags that accompany wrapper ingress requests.
 */
export type PublicConsentFlags = {
  semantic_targeting?: boolean;
  session_persistence?: boolean;
  cross_session_persistence?: boolean;
  prompt_shared?: boolean;
  gdpr_applies?: boolean;
  tcf_consent_string?: string;
  us_privacy?: string;
  gpp_string?: string;
  gpp_sections?: number[];
  consent_source?: PublicConsentSource;
};

/**
 * Supported browser-side human verification modes.
 */
export const PUBLIC_HUMAN_VERIFICATION_MODES = ["none", "interaction_required"] as const;

/**
 * Union of supported human verification modes.
 */
export type PublicHumanVerificationMode = (typeof PUBLIC_HUMAN_VERIFICATION_MODES)[number];

/**
 * Browser/device signals optionally attached to wrapper ingress requests.
 */
export type PublicBrowserDeviceSignals = {
  fingerprint_hint?: string;
  platform?: string;
  language?: string;
  timezone?: string;
  viewport_width?: number;
  viewport_height?: number;
  screen_width?: number;
  screen_height?: number;
  pixel_ratio?: number;
  color_depth?: number;
  hardware_concurrency?: number;
  device_memory_gb?: number;
  max_touch_points?: number;
  webdriver?: boolean;
  cookies_enabled?: boolean;
  do_not_track?: string;
};

/**
 * Human-verification state optionally attached to wrapper ingress requests.
 */
export type PublicHumanVerificationSignals = {
  mode?: PublicHumanVerificationMode;
  trusted_event_count?: number;
  pointer_event_count?: number;
  keyboard_event_count?: number;
  touch_event_count?: number;
  first_event_at_ms?: number;
  last_event_at_ms?: number;
  page_visible?: boolean;
  page_focused?: boolean;
};

/**
 * Verification signals optionally attached to wrapper ingress requests.
 */
export type PublicVerificationSignals = {
  device?: PublicBrowserDeviceSignals;
  human?: PublicHumanVerificationSignals;
};

/**
 * Supported creative delivery modes.
 */
export const PUBLIC_SLOT_MODES = ["clip", "banner", "native"] as const;

/**
 * Union of supported creative delivery modes.
 */
export type PublicSlotMode = (typeof PUBLIC_SLOT_MODES)[number];

/**
 * Structured native creative assets used by wavebird and SSP-facing contracts.
 */
export type PublicNativeCreativeAssets = {
  title: string;
  image_url: string;
  description?: string;
  cta_text?: string;
  icon_url?: string;
};

/**
 * Structured VAST tracking URLs used by video creatives.
 */
export type PublicVastTrackingSet = {
  impression: string[];
  start: string[];
  firstQuartile: string[];
  midpoint: string[];
  thirdQuartile: string[];
  complete: string[];
  pause: string[];
  resume: string[];
  skip: string[];
  mute: string[];
  unmute: string[];
  clickTracking: string[];
  clickThrough?: string | null;
};

/**
 * Supported decision delivery mechanisms for wrapper clients.
 */
export const PUBLIC_DECISION_DELIVERY_MODES = ["polling", "websocket", "callback"] as const;

/**
 * Union of supported decision delivery mechanisms.
 */
export type PublicDecisionDeliveryMode = (typeof PUBLIC_DECISION_DELIVERY_MODES)[number];

/**
 * Origins used to explain no-fill or error reasons in public responses.
 */
export const PUBLIC_REASON_ORIGINS = ["core_policy", "partner", "transport", "adapter"] as const;

/**
 * Union of supported public reason origins.
 */
export type PublicReasonOrigin = (typeof PUBLIC_REASON_ORIGINS)[number];

/**
 * Confidence labels for public latency estimation metadata.
 */
export const PUBLIC_LATENCY_CONFIDENCES = ["high", "medium", "low"] as const;

/**
 * Union of supported public latency confidence labels.
 */
export type PublicLatencyConfidence = (typeof PUBLIC_LATENCY_CONFIDENCES)[number];

/**
 * Sources used to explain where a latency estimate originated.
 */
export const PUBLIC_LATENCY_SOURCES = [
  "ingress_hint",
  "historical_p50",
  "combined_hint_and_history",
  "bootstrap_default",
] as const;

/**
 * Union of supported public latency source labels.
 */
export type PublicLatencySource = (typeof PUBLIC_LATENCY_SOURCES)[number];

/**
 * Stable identifier for an accepted wrapper job.
 */
export type PublicJobId = string;

/**
 * Stable identifier for a decision slot within a job.
 */
export type PublicSlotId = string;

/**
 * Stable identifier for a generation lifecycle instance.
 */
export type PublicGenerationId = string;

/**
 * Stable identifier for an SSP decision.
 */
export type PublicDecisionId = string;

/**
 * Join key shared between wavebird and an SSP for a slot.
 */
export type PublicJoinKey = string;

/**
 * Opaque asset token used for beaconing and settlement.
 */
export type PublicAssetToken = string;

/**
 * Stable identifier for a configured SSP partner.
 */
export type PublicSspPartnerId = string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMember<TValue extends string>(value: unknown, members: readonly TValue[]): value is TValue {
  return typeof value === "string" && members.includes(value as TValue);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalNonNegativeNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}

/**
 * Checks whether a value is a supported jurisdiction zone.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is one of the supported jurisdiction zones.
 */
export function isPublicJurisdictionZone(value: unknown): value is PublicJurisdictionZone {
  return isMember(value, PUBLIC_JURISDICTION_ZONES);
}

/**
 * Checks whether a value is a valid jurisdiction override object.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value contains only supported override fields.
 */
export function isPublicJurisdictionOverrides(value: unknown): value is PublicJurisdictionOverrides {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isOptionalBoolean(value["require_consent_collection"]) &&
    isOptionalBoolean(value["enforce_ad_label"]) &&
    isOptionalString(value["ad_label_text"]) &&
    isOptionalBoolean(value["gdpr_default"])
  );
}

/**
 * Checks whether a value matches the canonical public contract version format.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is a valid public contract version string.
 */
export function isPublicContractVersion(value: unknown): value is PublicContractVersion {
  return typeof value === "string" && /^csl_[a-z0-9_]+\/v[1-9][0-9]*$/i.test(value);
}

/**
 * Checks whether a value is a valid public consent flag object.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value contains the supported optional consent fields.
 */
export function isPublicConsentFlags(value: unknown): value is PublicConsentFlags {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isOptionalBoolean(value["semantic_targeting"]) &&
    isOptionalBoolean(value["session_persistence"]) &&
    isOptionalBoolean(value["cross_session_persistence"]) &&
    isOptionalBoolean(value["prompt_shared"]) &&
    isOptionalBoolean(value["gdpr_applies"]) &&
    isOptionalString(value["tcf_consent_string"]) &&
    isOptionalString(value["us_privacy"]) &&
    isOptionalString(value["gpp_string"]) &&
    (value["gpp_sections"] === undefined ||
      (Array.isArray(value["gpp_sections"]) &&
        value["gpp_sections"].every((section) => Number.isInteger(section) && section > 0))) &&
    (value["consent_source"] === undefined || isMember(value["consent_source"], PUBLIC_CONSENT_SOURCES))
  );
}

/**
 * Checks whether a value is a supported browser-side human verification mode.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is a supported human verification mode.
 */
export function isPublicHumanVerificationMode(value: unknown): value is PublicHumanVerificationMode {
  return isMember(value, PUBLIC_HUMAN_VERIFICATION_MODES);
}

/**
 * Checks whether a value matches the normalized browser/device verification shape.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value contains only supported device signal fields.
 */
export function isPublicBrowserDeviceSignals(value: unknown): value is PublicBrowserDeviceSignals {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isOptionalString(value["fingerprint_hint"]) &&
    isOptionalString(value["platform"]) &&
    isOptionalString(value["language"]) &&
    isOptionalString(value["timezone"]) &&
    isOptionalNonNegativeInteger(value["viewport_width"]) &&
    isOptionalNonNegativeInteger(value["viewport_height"]) &&
    isOptionalNonNegativeInteger(value["screen_width"]) &&
    isOptionalNonNegativeInteger(value["screen_height"]) &&
    isOptionalNonNegativeNumber(value["pixel_ratio"]) &&
    isOptionalNonNegativeInteger(value["color_depth"]) &&
    isOptionalNonNegativeInteger(value["hardware_concurrency"]) &&
    isOptionalNonNegativeNumber(value["device_memory_gb"]) &&
    isOptionalNonNegativeInteger(value["max_touch_points"]) &&
    isOptionalBoolean(value["webdriver"]) &&
    isOptionalBoolean(value["cookies_enabled"]) &&
    isOptionalString(value["do_not_track"])
  );
}

/**
 * Checks whether a value matches the normalized human-verification signal shape.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value contains only supported human-verification fields.
 */
export function isPublicHumanVerificationSignals(value: unknown): value is PublicHumanVerificationSignals {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value["mode"] === undefined || isPublicHumanVerificationMode(value["mode"])) &&
    isOptionalNonNegativeInteger(value["trusted_event_count"]) &&
    isOptionalNonNegativeInteger(value["pointer_event_count"]) &&
    isOptionalNonNegativeInteger(value["keyboard_event_count"]) &&
    isOptionalNonNegativeInteger(value["touch_event_count"]) &&
    isOptionalNonNegativeInteger(value["first_event_at_ms"]) &&
    isOptionalNonNegativeInteger(value["last_event_at_ms"]) &&
    isOptionalBoolean(value["page_visible"]) &&
    isOptionalBoolean(value["page_focused"])
  );
}

/**
 * Checks whether a value matches the normalized verification signal shape.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value contains only supported verification signal fields.
 */
export function isPublicVerificationSignals(value: unknown): value is PublicVerificationSignals {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value["device"] === undefined || isPublicBrowserDeviceSignals(value["device"])) &&
    (value["human"] === undefined || isPublicHumanVerificationSignals(value["human"]))
  );
}

/**
 * Checks whether a value is a supported public slot mode.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is one of `clip` or `banner`.
 */
export function isPublicSlotMode(value: unknown): value is PublicSlotMode {
  return isMember(value, PUBLIC_SLOT_MODES);
}

/**
 * Checks whether a value matches the normalized native creative asset shape.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value includes the required title and image URL.
 */
export function isPublicNativeCreativeAssets(value: unknown): value is PublicNativeCreativeAssets {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["title"] === "string" &&
    value["title"].trim().length > 0 &&
    typeof value["image_url"] === "string" &&
    value["image_url"].trim().length > 0 &&
    isOptionalString(value["description"]) &&
    isOptionalString(value["cta_text"]) &&
    isOptionalString(value["icon_url"])
  );
}

/**
 * Checks whether a value matches the normalized VAST tracking shape.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value includes the supported tracking arrays.
 */
export function isPublicVastTrackingSet(value: unknown): value is PublicVastTrackingSet {
  if (!isRecord(value)) {
    return false;
  }
  const isStringArray = (candidate: unknown): candidate is string[] =>
    Array.isArray(candidate) && candidate.every((entry) => typeof entry === "string" && entry.trim().length > 0);
  return (
    isStringArray(value["impression"]) &&
    isStringArray(value["start"]) &&
    isStringArray(value["firstQuartile"]) &&
    isStringArray(value["midpoint"]) &&
    isStringArray(value["thirdQuartile"]) &&
    isStringArray(value["complete"]) &&
    isStringArray(value["pause"]) &&
    isStringArray(value["resume"]) &&
    isStringArray(value["skip"]) &&
    isStringArray(value["mute"]) &&
    isStringArray(value["unmute"]) &&
    isStringArray(value["clickTracking"]) &&
    (value["clickThrough"] === undefined ||
      value["clickThrough"] === null ||
      (typeof value["clickThrough"] === "string" && value["clickThrough"].trim().length > 0))
  );
}

/**
 * Checks whether a value is a supported public decision delivery mode.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is one of `polling`, `websocket`, or `callback`.
 */
export function isPublicDecisionDeliveryMode(value: unknown): value is PublicDecisionDeliveryMode {
  return isMember(value, PUBLIC_DECISION_DELIVERY_MODES);
}

/**
 * Checks whether a value is a supported public reason origin.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is a known public reason origin.
 */
export function isPublicReasonOrigin(value: unknown): value is PublicReasonOrigin {
  return isMember(value, PUBLIC_REASON_ORIGINS);
}

/**
 * Checks whether a value is a supported latency confidence label.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is a known public latency confidence.
 */
export function isPublicLatencyConfidence(value: unknown): value is PublicLatencyConfidence {
  return isMember(value, PUBLIC_LATENCY_CONFIDENCES);
}

/**
 * Checks whether a value is a supported latency source label.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is a known public latency source.
 */
export function isPublicLatencySource(value: unknown): value is PublicLatencySource {
  return isMember(value, PUBLIC_LATENCY_SOURCES);
}
