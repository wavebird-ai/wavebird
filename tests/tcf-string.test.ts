import assert from "node:assert/strict";
import { parseTcfString } from "../src/consent/tcf-string.js";

function encodeBase64Url(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

const tcfString = [
  encodeBase64Url({
    schema: "wavebird_tcf_like",
    version: 1,
    cmpId: 0,
    decision: "custom",
    decidedAt: 1_740_000_000_000,
    expiresAt: 1_770_000_000_000,
    jurisdiction: "eu_strict",
    tcfPolicyVersion: 2,
    tcfMinorVersion: 2,
  }),
  encodeBase64Url({
    schema: "wavebird_tcf_like_purposes",
    storeAccess: 1,
    basicAds: 1,
    personalizedAds: 0,
    measurement: 1,
  }),
].join(".");
assert.match(tcfString, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);

const parsed = parseTcfString(tcfString);
assert.deepEqual(parsed, {
  version: 1,
  cmp_id: 0,
  decision: "custom",
  purposes: {
    store_access: true,
    basic_ads: true,
    personalized_ads: false,
    measurement: true,
  },
  decided_at: 1_740_000_000_000,
  expires_at: 1_770_000_000_000,
  jurisdiction: "eu_strict",
});

assert.equal(parseTcfString("not-a-valid-string"), null);
assert.equal(parseTcfString("bm90anNvbg.bm90anNvbg"), null);

console.log("sdk/tcf-string.test.ts ok");
