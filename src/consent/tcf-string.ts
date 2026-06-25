import type { ConsentDecision, ConsentPurposes } from "./consent-store.js";

export type ParsedWavebirdTcfString = {
  version: 1;
  cmp_id: 0;
  decision: ConsentDecision;
  purposes: ConsentPurposes;
  decided_at: number;
  expires_at: number;
  jurisdiction: string;
};

type WavebirdTcfCoreSegment = {
  schema: "wavebird_tcf_like";
  version: 1;
  cmpId: 0;
  decision: ConsentDecision;
  decidedAt: number;
  expiresAt: number;
  jurisdiction: string;
  tcfPolicyVersion: 2;
  tcfMinorVersion: 2;
};

type WavebirdTcfPurposeSegment = {
  schema: "wavebird_tcf_like_purposes";
  storeAccess: 0 | 1;
  basicAds: 0 | 1;
  personalizedAds: 0 | 1;
  measurement: 0 | 1;
};

function decodeBase64(value: string): string | null {
  try {
    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new TextDecoder().decode(bytes);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf8");
    }
  } catch {
    return null;
  }
  return null;
}

function decodeBase64Url(input: string): string | null {
  if (typeof input !== "string" || input.trim().length === 0) {
    return null;
  }
  const normalized = input.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return decodeBase64(padded);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isConsentDecision(value: unknown): value is ConsentDecision {
  return value === "accept_all" || value === "reject_personalization" || value === "custom";
}

function parseJsonSegment<T>(segment: string): T | null {
  const decoded = decodeBase64Url(segment);
  if (!decoded) {
    return null;
  }
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

/**
 * Parses legacy wavebird-local beta consent strings so older test/sandbox records can be inspected.
 * This does not parse arbitrary IAB TC strings and must not be used as CMP output.
 */
export function parseTcfString(value: string): ParsedWavebirdTcfString | null {
  const segments = value.split(".");
  if (segments.length !== 2) {
    return null;
  }
  const coreSegment = segments[0];
  const purposeSegment = segments[1];
  if (typeof coreSegment !== "string" || typeof purposeSegment !== "string") {
    return null;
  }
  const core = parseJsonSegment<WavebirdTcfCoreSegment>(coreSegment);
  const purposes = parseJsonSegment<WavebirdTcfPurposeSegment>(purposeSegment);
  if (!isRecord(core) || !isRecord(purposes)) {
    return null;
  }
  if (
    core["schema"] !== "wavebird_tcf_like" ||
    core["version"] !== 1 ||
    core["cmpId"] !== 0 ||
    !isConsentDecision(core["decision"]) ||
    typeof core["decidedAt"] !== "number" ||
    typeof core["expiresAt"] !== "number" ||
    typeof core["jurisdiction"] !== "string" ||
    purposes["schema"] !== "wavebird_tcf_like_purposes"
  ) {
    return null;
  }
  return {
    version: 1,
    cmp_id: 0,
    decision: core.decision,
    decided_at: core.decidedAt,
    expires_at: core.expiresAt,
    jurisdiction: core.jurisdiction,
    purposes: {
      store_access: purposes["storeAccess"] === 1,
      basic_ads: purposes["basicAds"] === 1,
      personalized_ads: purposes["personalizedAds"] === 1,
      measurement: purposes["measurement"] === 1,
    },
  };
}
