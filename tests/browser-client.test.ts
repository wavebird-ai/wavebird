import assert from "node:assert/strict";
import http from "node:http";
import { WavebirdClient } from "../src/browser-client.js";
import { WavebirdSdkErrorCode } from "../src/errors.js";

const capturedJobBodies: Array<Record<string, unknown>> = [];
const originalFetch = globalThis.fetch;

const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  });
  req.on("end", () => {
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText.length > 0 ? (JSON.parse(bodyText) as Record<string, unknown>) : {};

    res.setHeader("content-type", "application/json");

    if (req.method === "POST" && path === "/public/wrapper/v1/jobs") {
      capturedJobBodies.push(body);
      const index = capturedJobBodies.length;
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          contract_version: "csl_wrapper_ingress_accepted/v1",
          job_id: `job_${index}`,
          slot_ids: [`slot_${index}`],
          status: "accepted",
          decision_delivery: {
            mode: "polling",
            decision_path_template: "/public/wrapper/v1/slots/{slot_id}/decision",
          },
        })
      );
      return;
    }

    if (req.method === "GET" && path === "/public/wrapper/v1/slots/slot_nofill/decision") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          contract_version: "csl_wrapper_decision/v1",
          slot_id: "slot_nofill",
          status: "ready",
          fill: false,
          reason: "slot_marked_no_fill",
          no_fill_reason: "slot_marked_no_fill",
          creative: null,
          asset_token: null,
          constraints: null,
          cs_declaration: "CS-S (S1/P0)*",
          revenue_estimate: null,
        })
      );
      return;
    }

    if (req.method === "POST" && path === "/public/wrapper/v1/beacons") {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          contract_version: "csl_wrapper_beacon/v1",
          accepted: true,
          reason_code: "OK",
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("sdk_browser_test_missing_address");
}

try {
  const client = new WavebirdClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    getApiKey: () => "wrapper-test-key",
    decisionDelivery: "polling",
    publisher: {
      app_name: "Default App",
      app_domain: "default.example",
      categories: ["IAB19"],
    },
  });

  const minimalJob = await client.createJob({
    job_type: "chat",
  });
  assert.ok(minimalJob);

  const minimalBody = capturedJobBodies[0]!;
  assert.deepEqual(minimalBody.job, {
    job_type: "chat",
    slots_requested: 1,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(minimalBody, "prompt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(minimalBody, "consent"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(minimalBody, "slot_config"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(minimalBody, "brand_safety"), false);
  assert.deepEqual(minimalBody.publisher, {
    app_name: "Default App",
    app_domain: "default.example",
    categories: ["IAB19"],
  });

  const expandedJob = await client.createJob({
    job_type: "chat",
    context: {
      topic: "programming",
    },
    consent: {
      semantic_targeting: true,
      prompt_shared: false,
      gdpr_applies: true,
      consent_source: "wrapper_cmp",
    },
    publisher: {
      app_name: "Override App",
    },
    brand_safety: {
      blocked_categories: ["gambling"],
      blocked_domains: ["example-bad.com"],
    },
    slot_config: {
      allowed_formats: ["banner", "native"],
      max_width: 728,
      bidfloor: 0.5,
      bidfloorcur: "EUR",
    },
    verification: {
      device: {
        fingerprint_hint: "wbv_browsertest1",
        viewport_width: 1280,
        viewport_height: 720,
        screen_width: 1440,
        screen_height: 900,
        webdriver: false,
      },
      human: {
        mode: "interaction_required",
        trusted_event_count: 2,
        pointer_event_count: 1,
        keyboard_event_count: 1,
        last_event_at_ms: Date.now(),
        page_visible: true,
        page_focused: true,
      },
    },
  });
  assert.ok(expandedJob);

  const expandedBody = capturedJobBodies[1]!;
  assert.deepEqual(expandedBody.publisher, {
    app_name: "Override App",
    app_domain: "default.example",
    categories: ["IAB19"],
  });
  assert.deepEqual(expandedBody.context, {
    topic: "programming",
  });
  assert.deepEqual(expandedBody.consent, {
    semantic_targeting: true,
    prompt_shared: false,
    gdpr_applies: true,
    consent_source: "wrapper_cmp",
  });
  assert.deepEqual(expandedBody.brand_safety, {
    blocked_categories: ["gambling"],
    blocked_domains: ["example-bad.com"],
  });
  assert.deepEqual(expandedBody.slot_config, {
    allowed_formats: ["banner", "native"],
    max_width: 728,
    bidfloor: 0.5,
    bidfloorcur: "EUR",
  });
  assert.match(
    String((expandedBody.verification as { device?: { fingerprint_hint?: string } })?.device?.fingerprint_hint ?? ""),
    /^wbv_[a-f0-9]{8}$/i
  );
  assert.equal((expandedBody.verification as { human?: { mode?: string } })?.human?.mode, "interaction_required");

  const verificationErrors: Array<{ code: string; cause?: unknown }> = [];
  const verificationClient = new WavebirdClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    getApiKey: () => "wrapper-test-key",
    decisionDelivery: "polling",
    options: {
      humanVerification: {
        mode: "interaction_required",
      },
      onError: (error) => {
        verificationErrors.push({
          code: error.code,
          cause: error.cause,
        });
      },
    },
  });
  const blockedJob = await verificationClient.createJob({
    job_type: "chat",
  });
  assert.equal(blockedJob, null);
  assert.ok(
    verificationErrors.some(
      (entry) =>
        entry.code === WavebirdSdkErrorCode.VERIFICATION_REQUIRED &&
        entry.cause instanceof Error &&
        entry.cause.message === "trusted_interaction_required"
    )
  );

  const noFillDecision = await client.getDecision("slot_nofill");
  assert.equal(noFillDecision.fill, false);
  if (noFillDecision.fill === false) {
    assert.equal(noFillDecision.reason, "slot_marked_no_fill");
    assert.equal(noFillDecision.no_fill_reason, "slot_marked_no_fill");
  }

  const fetchCalls: RequestInit[] = [];
  globalThis.fetch = async (input, init) => {
    fetchCalls.push(init ?? {});
    return originalFetch(input, init);
  };
  try {
    const beaconResponse = await client.sendBeacon({
      beacon_id: "browser-rendered-1",
      asset_token: "asset-browser-1",
      beacon_type: "rendered",
      occurred_at_ms_client: Date.now(),
    });
    assert.equal(beaconResponse.accepted, true);
    assert.equal(fetchCalls.at(-1)?.keepalive, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const rateLimitedServer = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/public/wrapper/v1/jobs") {
      res.statusCode = 429;
      res.setHeader("retry-after", "1");
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => rateLimitedServer.listen(0, "127.0.0.1", () => resolve()));
  const rateLimitedAddress = rateLimitedServer.address();
  if (!rateLimitedAddress || typeof rateLimitedAddress === "string") {
    throw new Error("sdk_browser_rate_limited_server_missing_address");
  }
  try {
    const rateLimitedLogs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
    const rateLimitedClient = new WavebirdClient({
      baseUrl: `http://127.0.0.1:${rateLimitedAddress.port}`,
      getApiKey: () => "wrapper-test-key",
      decisionDelivery: "polling",
      options: {
        logLevel: "warn",
        logger: {
          warn: (message, meta) => {
            rateLimitedLogs.push({ level: "warn", message, meta });
          },
        },
      },
    });
    const rateLimitedJob = await rateLimitedClient.createJob({
      job_type: "chat",
    });
    assert.deepEqual(rateLimitedJob, {
      error: "rate_limit_exceeded",
      retry_after_ms: 1000,
    });
    assert.ok(rateLimitedLogs.some((entry) => entry.level === "warn" && entry.meta?.retry_after_ms === 1000));
  } finally {
    await new Promise<void>((resolve, reject) => {
      rateLimitedServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
} finally {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

console.log("sdk/browser-client.test.ts ok");
