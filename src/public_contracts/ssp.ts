import {
  type PublicContractVersion,
  type PublicNativeCreativeAssets,
  type PublicReasonOrigin,
  type PublicSlotMode,
  isPublicContractVersion,
  isPublicNativeCreativeAssets,
  isPublicReasonOrigin,
  isPublicSlotMode,
} from "./common.js";

/**
 * Contract version for SSP slot signal payloads.
 */
export const SSP_SLOT_SIGNAL_CONTRACT_VERSION = "csl_ssp_slot_signal/v1" as const;
/**
 * Contract version for SSP decision responses.
 */
export const SSP_DECISION_RESPONSE_CONTRACT_VERSION = "csl_ssp_decision_response/v1" as const;
/**
 * Contract version for SSP decision ingress requests.
 */
export const SSP_DECISION_INGRESS_CONTRACT_VERSION = "csl_ssp_decision_ingress/v1" as const;
/**
 * Contract version for SSP decision accepted acknowledgements.
 */
export const SSP_DECISION_ACCEPTED_CONTRACT_VERSION = "csl_ssp_decision_accepted/v1" as const;

/**
 * Literal contract version type for SSP slot signal payloads.
 */
export type SspSlotSignalContractVersion = typeof SSP_SLOT_SIGNAL_CONTRACT_VERSION;
/**
 * Literal contract version type for SSP decision responses.
 */
export type SspDecisionResponseContractVersion = typeof SSP_DECISION_RESPONSE_CONTRACT_VERSION;
/**
 * Literal contract version type for SSP decision ingress requests.
 */
export type SspDecisionIngressContractVersion = typeof SSP_DECISION_INGRESS_CONTRACT_VERSION;
/**
 * Literal contract version type for SSP decision acknowledgements.
 */
export type SspDecisionAcceptedContractVersion = typeof SSP_DECISION_ACCEPTED_CONTRACT_VERSION;

/**
 * Slot signal payload sent from wavebird to an SSP.
 */
export type CslSspSlotSignalV1 = {
  contract_version: SspSlotSignalContractVersion;
  join_key: string;
  ssp_partner_id: string;
  delivery_constraints: {
    allowed_modes: PublicSlotMode[];
    estimated_window_ms: number;
    max_creative_duration_ms: number;
    fallback_mode: "banner";
  };
  classification?: {
    topics?: string[];
    intent?: string;
    sensitivity?: string;
  };
  placement?: {
    locale?: string;
  };
  fairness?: {
    scope_key: string;
    scope_kind?: "session" | "cross_session";
  };
};

/**
 * SSP decision response that contains a fill.
 */
export type CslSspDecisionFilledV1 = {
  contract_version: SspDecisionResponseContractVersion;
  status: "filled";
  decision: {
    decision_id: string;
    creative_url: string;
    mode?: PublicSlotMode | null;
    duration_ms?: number;
    width?: number;
    height?: number;
    mime_type?: string;
    native_assets?: PublicNativeCreativeAssets;
    deal_id?: string | null;
    price_eur_micro?: number | null;
    constraints?: Record<string, unknown> | null;
  };
  reason: null;
  reason_origin: null;
  retryable: null;
};

/**
 * SSP decision response that contains an explicit no-fill.
 */
export type CslSspDecisionNoFillV1 = {
  contract_version: SspDecisionResponseContractVersion;
  status: "no_fill";
  decision: null;
  reason: string;
  reason_origin?: Extract<PublicReasonOrigin, "core_policy" | "partner" | "transport">;
  retryable: null;
};

/**
 * SSP decision response that represents an error.
 */
export type CslSspDecisionErrorV1 = {
  contract_version: SspDecisionResponseContractVersion;
  status: "error";
  decision: null;
  reason: string;
  reason_origin?: Extract<PublicReasonOrigin, "adapter" | "transport">;
  retryable: boolean;
};

/**
 * Union of all SSP decision response variants.
 */
export type CslSspDecisionResponseV1 = CslSspDecisionFilledV1 | CslSspDecisionNoFillV1 | CslSspDecisionErrorV1;

/**
 * SSP decision ingress request that binds a response to a join key.
 */
export type CslSspDecisionIngressV1 = {
  contract_version: SspDecisionIngressContractVersion;
  join_key: string;
  response: CslSspDecisionResponseV1;
};

/**
 * Acknowledgement returned after wavebird accepts an SSP decision ingress request.
 */
export type CslSspDecisionAcceptedV1 = {
  contract_version: SspDecisionAcceptedContractVersion;
  accepted: true;
  slot_id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isNonEmptyString(value);
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isSlotModeArray(value: unknown): value is PublicSlotMode[] {
  return Array.isArray(value) && value.every((entry) => isPublicSlotMode(entry));
}

/**
 * Checks whether a value is an SSP contract version string.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value belongs to the `csl_ssp_*` contract family.
 */
export function isSspContractVersion(value: unknown): value is PublicContractVersion {
  return isPublicContractVersion(value) && value.startsWith("csl_ssp_");
}

/**
 * Validates an SSP slot signal payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslSspSlotSignalV1`.
 */
export function isCslSspSlotSignalV1(value: unknown): value is CslSspSlotSignalV1 {
  if (!isRecord(value) || value["contract_version"] !== SSP_SLOT_SIGNAL_CONTRACT_VERSION) {
    return false;
  }
  const deliveryConstraints = isRecord(value["delivery_constraints"]) ? value["delivery_constraints"] : null;
  const classification =
    value["classification"] === undefined ? null : isRecord(value["classification"]) ? value["classification"] : null;
  const placement = value["placement"] === undefined ? null : isRecord(value["placement"]) ? value["placement"] : null;
  const fairness = value["fairness"] === undefined ? null : isRecord(value["fairness"]) ? value["fairness"] : null;
  return (
    isNonEmptyString(value["join_key"]) &&
    isNonEmptyString(value["ssp_partner_id"]) &&
    deliveryConstraints !== null &&
    isSlotModeArray(deliveryConstraints["allowed_modes"]) &&
    typeof deliveryConstraints["estimated_window_ms"] === "number" &&
    Number.isFinite(deliveryConstraints["estimated_window_ms"]) &&
    deliveryConstraints["estimated_window_ms"] > 0 &&
    typeof deliveryConstraints["max_creative_duration_ms"] === "number" &&
    Number.isFinite(deliveryConstraints["max_creative_duration_ms"]) &&
    deliveryConstraints["max_creative_duration_ms"] > 0 &&
    deliveryConstraints["fallback_mode"] === "banner" &&
    (classification === null ||
      ((classification["topics"] === undefined ||
        (Array.isArray(classification["topics"]) && classification["topics"].every((entry) => isNonEmptyString(entry)))) &&
        isOptionalString(classification["intent"]) &&
        isOptionalString(classification["sensitivity"]))) &&
    (placement === null || isOptionalString(placement["locale"])) &&
    (fairness === null ||
      (isNonEmptyString(fairness["scope_key"]) &&
        (fairness["scope_kind"] === undefined ||
          fairness["scope_kind"] === "session" ||
          fairness["scope_kind"] === "cross_session")))
  );
}

/**
 * Validates an SSP decision response payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslSspDecisionResponseV1`.
 */
export function isCslSspDecisionResponseV1(value: unknown): value is CslSspDecisionResponseV1 {
  if (!isRecord(value) || value["contract_version"] !== SSP_DECISION_RESPONSE_CONTRACT_VERSION) {
    return false;
  }
  if (value["status"] === "filled") {
    const decision = isRecord(value["decision"]) ? value["decision"] : null;
    return (
      decision !== null &&
      isNonEmptyString(decision["decision_id"]) &&
      isNonEmptyString(decision["creative_url"]) &&
      (decision["mode"] === undefined || decision["mode"] === null || isPublicSlotMode(decision["mode"])) &&
      isOptionalNumber(decision["duration_ms"]) &&
      isOptionalNumber(decision["width"]) &&
      isOptionalNumber(decision["height"]) &&
      isOptionalString(decision["mime_type"]) &&
      (decision["native_assets"] === undefined || isPublicNativeCreativeAssets(decision["native_assets"])) &&
      isOptionalNullableString(decision["deal_id"]) &&
      (decision["price_eur_micro"] === undefined ||
        decision["price_eur_micro"] === null ||
        (typeof decision["price_eur_micro"] === "number" && Number.isFinite(decision["price_eur_micro"]))) &&
      (decision["constraints"] === undefined || decision["constraints"] === null || isRecord(decision["constraints"])) &&
      value["reason"] === null &&
      value["reason_origin"] === null &&
      value["retryable"] === null
    );
  }
  if (value["status"] === "no_fill") {
    return (
      value["decision"] === null &&
      isNonEmptyString(value["reason"]) &&
      (value["reason_origin"] === undefined ||
        value["reason_origin"] === "core_policy" ||
        value["reason_origin"] === "partner" ||
        value["reason_origin"] === "transport") &&
      value["retryable"] === null
    );
  }
  if (value["status"] === "error") {
    return (
      value["decision"] === null &&
      isNonEmptyString(value["reason"]) &&
      (value["reason_origin"] === undefined ||
        value["reason_origin"] === "adapter" ||
        value["reason_origin"] === "transport") &&
      typeof value["retryable"] === "boolean"
    );
  }
  return false;
}

/**
 * Validates an SSP decision ingress payload.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslSspDecisionIngressV1`.
 */
export function isCslSspDecisionIngressV1(value: unknown): value is CslSspDecisionIngressV1 {
  return (
    isRecord(value) &&
    value["contract_version"] === SSP_DECISION_INGRESS_CONTRACT_VERSION &&
    isNonEmptyString(value["join_key"]) &&
    isCslSspDecisionResponseV1(value["response"])
  );
}

/**
 * Validates an SSP decision accepted acknowledgement.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value matches `CslSspDecisionAcceptedV1`.
 */
export function isCslSspDecisionAcceptedV1(value: unknown): value is CslSspDecisionAcceptedV1 {
  return (
    isRecord(value) &&
    value["contract_version"] === SSP_DECISION_ACCEPTED_CONTRACT_VERSION &&
    value["accepted"] === true &&
    isNonEmptyString(value["slot_id"])
  );
}

/**
 * Validates reason origins that are legal on SSP responses.
 *
 * @param value - Candidate value to validate.
 * @returns `true` when the value is a public SSP reason origin.
 */
export function isPublicSspReasonOrigin(value: unknown): value is PublicReasonOrigin {
  return isPublicReasonOrigin(value);
}
