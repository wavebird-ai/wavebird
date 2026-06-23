import assert from "node:assert/strict";
import {
  BrowserVerificationTracker,
  evaluateHumanVerificationRequirement,
} from "../src/browser-verification.js";

const tracker = new BrowserVerificationTracker();

tracker.recordInteraction("pointer", {
  trusted: false,
  at_ms: 1_000,
});

let snapshot = tracker.snapshot("interaction_required");
assert.equal(snapshot.trusted_event_count, 0);
assert.equal(snapshot.pointer_event_count, 0);

tracker.recordInteraction("pointer", {
  trusted: true,
  at_ms: 2_000,
});
tracker.recordInteraction("keyboard", {
  trusted: true,
  at_ms: 2_500,
});

snapshot = tracker.snapshot("interaction_required");
assert.equal(snapshot.mode, "interaction_required");
assert.equal(snapshot.trusted_event_count, 2);
assert.equal(snapshot.pointer_event_count, 1);
assert.equal(snapshot.keyboard_event_count, 1);
assert.equal(snapshot.touch_event_count, 0);
assert.equal(snapshot.first_event_at_ms, 2_000);
assert.equal(snapshot.last_event_at_ms, 2_500);

assert.deepEqual(
  evaluateHumanVerificationRequirement({
    verification: {
      human: snapshot,
    },
    mode: "interaction_required",
    now_ms: 10_000,
    max_interaction_age_ms: 20_000,
  }),
  { ok: true }
);

assert.deepEqual(
  evaluateHumanVerificationRequirement({
    verification: {
      human: snapshot,
    },
    mode: "interaction_required",
    now_ms: 70_000,
    max_interaction_age_ms: 60_000,
  }),
  { ok: false, reason: "trusted_interaction_stale" }
);

assert.deepEqual(
  evaluateHumanVerificationRequirement({
    verification: {
      human: {
        mode: "interaction_required",
        trusted_event_count: 0,
      },
    },
    mode: "interaction_required",
  }),
  { ok: false, reason: "trusted_interaction_required" }
);

console.log("sdk/browser-verification.test.ts ok");
