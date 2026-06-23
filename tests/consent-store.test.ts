import assert from "node:assert/strict";
import {
  CONSENT_STORAGE_KEY,
  clearConsent,
  getConsent,
  needsRefresh,
  setConsent,
} from "../src/consent/consent-store.js";

class FakeStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.has(key) ? this.entries.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

const originalLocalStorage = globalThis.localStorage;
Object.assign(globalThis, {
  localStorage: new FakeStorage(),
});

try {
  clearConsent();
  assert.equal(getConsent(), null);
  assert.equal(needsRefresh(), true);

  const decidedAt = Date.UTC(2026, 0, 31, 12, 0, 0);
  const stored = setConsent("reject_personalization", {
    jurisdiction: "eu_strict",
    now: decidedAt,
  });
  assert.equal(stored.version, 1);
  assert.equal(stored.jurisdiction, "eu_strict");
  assert.equal(stored.decision, "reject_personalization");
  assert.deepEqual(stored.purposes, {
    store_access: true,
    basic_ads: true,
    personalized_ads: false,
    measurement: true,
  });
  assert.equal(stored.decided_at, decidedAt);
  assert.equal(stored.expires_at, Date.UTC(2027, 1, 28, 12, 0, 0));

  const roundTrip = getConsent();
  assert.deepEqual(roundTrip, stored);
  assert.equal(needsRefresh(roundTrip, roundTrip!.expires_at - 1), false);
  assert.equal(needsRefresh(roundTrip, roundTrip!.expires_at), true);

  const custom = setConsent("custom", {
    jurisdiction: "br_lgpd",
    now: decidedAt,
    purposes: {
      store_access: true,
      measurement: true,
    },
  });
  assert.deepEqual(custom.purposes, {
    store_access: true,
    basic_ads: false,
    personalized_ads: false,
    measurement: true,
  });

  globalThis.localStorage.setItem(CONSENT_STORAGE_KEY, '{"version":99}');
  assert.equal(getConsent(), null);
  assert.equal(globalThis.localStorage.getItem(CONSENT_STORAGE_KEY), null);
} finally {
  Object.assign(globalThis, {
    localStorage: originalLocalStorage,
  });
}

console.log("sdk/consent-store.test.ts ok");
