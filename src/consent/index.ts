export {
  CONSENT_RECORD_VERSION,
  CONSENT_REQUIRED_ZONES,
  CONSENT_STORAGE_KEY,
  clearConsent,
  getAcceptAllPurposes,
  getBasicAdsOnlyPurposes,
  getConsent,
  getDefaultConsentPurposes,
  needsRefresh,
  requiresConsentCollection,
  resolveConsentLocale,
  setConsent,
  type ConsentDecision,
  type ConsentPurposes,
  type SetConsentOptions,
  type StoredConsentRecord,
} from "./consent-store.js";
export { parseTcfString, type ParsedWavebirdTcfString } from "./tcf-string.js";
export { mountConsentDialog, type MountConsentDialogOptions } from "./mountConsentDialog.js";
