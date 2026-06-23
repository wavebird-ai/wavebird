import type { PublicJurisdictionOverrides, PublicJurisdictionZone } from "../public_contracts.js";

export const CONSENT_STORAGE_KEY = "wavebird_consent_v1";
export const CONSENT_RECORD_VERSION = 1 as const;
export const CONSENT_REQUIRED_ZONES: PublicJurisdictionZone[] = ["eu_strict", "br_lgpd"];

export type ConsentDecision = "accept_all" | "reject_personalization" | "custom";

export type ConsentPurposes = {
  store_access: boolean;
  basic_ads: boolean;
  personalized_ads: boolean;
  measurement: boolean;
};

export type StoredConsentRecord = {
  version: typeof CONSENT_RECORD_VERSION;
  decision: ConsentDecision;
  purposes: ConsentPurposes;
  decided_at: number;
  expires_at: number;
  jurisdiction: string;
};

export type SetConsentOptions = {
  purposes?: Partial<ConsentPurposes>;
  jurisdiction?: string;
  now?: number;
};

const DEFAULT_CUSTOM_PURPOSES: ConsentPurposes = {
  store_access: false,
  basic_ads: false,
  personalized_ads: false,
  measurement: false,
};

const ACCEPT_ALL_PURPOSES: ConsentPurposes = {
  store_access: true,
  basic_ads: true,
  personalized_ads: true,
  measurement: true,
};

const BASIC_ONLY_PURPOSES: ConsentPurposes = {
  store_access: true,
  basic_ads: true,
  personalized_ads: false,
  measurement: true,
};

function readStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPurposes(value: unknown): value is ConsentPurposes {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["store_access"] === "boolean" &&
    typeof value["basic_ads"] === "boolean" &&
    typeof value["personalized_ads"] === "boolean" &&
    typeof value["measurement"] === "boolean"
  );
}

function isStoredConsentRecord(value: unknown): value is StoredConsentRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value["version"] === CONSENT_RECORD_VERSION &&
    (value["decision"] === "accept_all" ||
      value["decision"] === "reject_personalization" ||
      value["decision"] === "custom") &&
    isPurposes(value["purposes"]) &&
    typeof value["decided_at"] === "number" &&
    Number.isFinite(value["decided_at"]) &&
    typeof value["expires_at"] === "number" &&
    Number.isFinite(value["expires_at"]) &&
    typeof value["jurisdiction"] === "string" &&
    value["jurisdiction"].trim().length > 0
  );
}

function clonePurposes(value: ConsentPurposes): ConsentPurposes {
  return {
    store_access: value.store_access,
    basic_ads: value.basic_ads,
    personalized_ads: value.personalized_ads,
    measurement: value.measurement,
  };
}

function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const sourceYear = source.getUTCFullYear();
  const sourceMonth = source.getUTCMonth();
  const sourceDay = source.getUTCDate();
  const monthIndex = sourceMonth + months;
  const targetYear = sourceYear + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(sourceDay, lastDayOfTargetMonth);
  return Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );
}

function normalizePurposes(decision: ConsentDecision, overrides?: Partial<ConsentPurposes>): ConsentPurposes {
  if (decision === "accept_all") {
    return clonePurposes(ACCEPT_ALL_PURPOSES);
  }
  if (decision === "reject_personalization") {
    return clonePurposes(BASIC_ONLY_PURPOSES);
  }
  return {
    store_access: overrides?.store_access === true,
    basic_ads: overrides?.basic_ads === true,
    personalized_ads: overrides?.personalized_ads === true,
    measurement: overrides?.measurement === true,
  };
}

function writeConsent(record: StoredConsentRecord): StoredConsentRecord {
  const storage = readStorage();
  if (!storage) {
    return record;
  }
  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage write failures to keep the widget fail-silent.
  }
  return record;
}

function clearMalformedConsent(storage: Storage | null): null {
  if (!storage) {
    return null;
  }
  try {
    storage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
  return null;
}

export function getConsent(): StoredConsentRecord | null {
  const storage = readStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredConsentRecord(parsed)) {
      return clearMalformedConsent(storage);
    }
    if (parsed.expires_at <= Date.now()) {
      return clearMalformedConsent(storage);
    }
    return {
      ...parsed,
      purposes: clonePurposes(parsed.purposes),
      jurisdiction: parsed.jurisdiction.trim(),
    };
  } catch {
    return clearMalformedConsent(storage);
  }
}

export function setConsent(decision: ConsentDecision, options: SetConsentOptions = {}): StoredConsentRecord {
  const decided_at = Number.isFinite(options.now) ? Math.trunc(options.now as number) : Date.now();
  const record: StoredConsentRecord = {
    version: CONSENT_RECORD_VERSION,
    decision,
    purposes: normalizePurposes(decision, options.purposes),
    decided_at,
    expires_at: addCalendarMonths(decided_at, 13),
    jurisdiction: options.jurisdiction?.trim() || "rest_of_world",
  };
  return writeConsent(record);
}

export function clearConsent(): void {
  clearMalformedConsent(readStorage());
}

export function needsRefresh(consent: StoredConsentRecord | null = getConsent(), now = Date.now()): boolean {
  if (!consent) {
    return true;
  }
  return consent.expires_at <= now;
}

export function resolveConsentLocale(locale: string | null | undefined): "en" | "de" | "es" | "fr" | "pt" | "ja" {
  const normalized = (locale ?? "").trim().toLowerCase();
  if (normalized.startsWith("de")) {
    return "de";
  }
  if (normalized.startsWith("es")) {
    return "es";
  }
  if (normalized.startsWith("fr")) {
    return "fr";
  }
  if (normalized.startsWith("pt")) {
    return "pt";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }
  return "en";
}

export function getDefaultConsentPurposes(): ConsentPurposes {
  return clonePurposes(DEFAULT_CUSTOM_PURPOSES);
}

export function getAcceptAllPurposes(): ConsentPurposes {
  return clonePurposes(ACCEPT_ALL_PURPOSES);
}

export function getBasicAdsOnlyPurposes(): ConsentPurposes {
  return clonePurposes(BASIC_ONLY_PURPOSES);
}

export function requiresConsentCollection(
  jurisdictionZone?: PublicJurisdictionZone | null,
  jurisdictionOverrides?: PublicJurisdictionOverrides | null
): boolean {
  if (typeof jurisdictionOverrides?.require_consent_collection === "boolean") {
    return jurisdictionOverrides.require_consent_collection;
  }
  return Boolean(jurisdictionZone && CONSENT_REQUIRED_ZONES.includes(jurisdictionZone));
}
