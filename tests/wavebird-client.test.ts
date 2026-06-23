import assert from "node:assert/strict";
import http from "node:http";
import { WavebirdClient } from "../src/wavebird-client.js";
import { WavebirdSdkErrorCode } from "../src/errors.js";
import { startTestServer } from "./_local-test-server.js";

const server = await startTestServer();

try {
  const browserEntry = await import("../dist/sdk/src/browser.js");
  const packageIndex = await import("../dist/sdk/src/index.js");
  assert.deepEqual(Object.keys(browserEntry).sort(), [
    "WavebirdClient",
    "WavebirdSdkError",
    "WavebirdSdkErrorCode",
    "normalizeWavebirdPlacement",
    "resolveAdTimingPlan",
  ]);
  assert.equal(typeof browserEntry.WavebirdClient, "function");
  assert.notEqual(browserEntry.WavebirdClient, packageIndex.WavebirdClient);
  assert.equal(browserEntry.WavebirdSdkError, packageIndex.WavebirdSdkError);
  assert.equal(browserEntry.WavebirdSdkErrorCode.DECISION_TIMEOUT, WavebirdSdkErrorCode.DECISION_TIMEOUT);
  assert.equal(typeof browserEntry.resolveAdTimingPlan, "function");
  assert.equal(typeof browserEntry.normalizeWavebirdPlacement, "function");
  assert.equal(typeof packageIndex.normalizeWavebirdPlacement, "function");
  assert.deepEqual(packageIndex.resolveAdTimingPlan("while"), {
    mode: "while",
    request_phase: "during_inference",
    render_phase: "during_inference",
    keep_mounted_after_inference: false,
  });
  assert.deepEqual(browserEntry.resolveAdTimingPlan("before"), {
    mode: "before",
    request_phase: "before_inference",
    render_phase: "before_inference",
    keep_mounted_after_inference: true,
  });

  const client = new WavebirdClient({
    baseUrl: server.base_url,
    getApiKey: () => server.wrapper_api_key,
    decisionDelivery: "polling",
    publisher: {
      app_name: "My App",
      app_domain: "myapp.example",
      categories: ["IAB19"],
    },
    options: {
      decision_timeout_ms: 3_000,
      timeout_ms: 1_000,
      long_poll_wait_ms: 200,
      short_poll_interval_ms: 50,
    },
  });

  const job = await client.createJob({
    job_type: "chat",
  });
  assert.ok(job);
  const slot_id = job?.slot_ids[0] ?? "";
  assert.equal(job?.status, "accepted");
  const createJobLogs = server.logs.filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === "/v1/jobs";
  });
  assert.ok(createJobLogs.length >= 1);

  const expandedJob = await client.createJob({
    job_type: "chat",
    context: { topic: "programming" },
    consent: {
      semantic_targeting: true,
      prompt_shared: false,
      gdpr_applies: true,
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
  });
  assert.ok(expandedJob);

  await client.reportGeneration(job!.job_id, "started", { model_id: "gpt-4o-mini" });
  const decision = await client.getDecision(slot_id);
  assert.equal(decision.fill, true);

  if (decision.fill === true) {
    const sdkPlacement = packageIndex.normalizeWavebirdPlacement(decision);
    assert.equal(sdkPlacement?.asset_token, decision.asset_token);
    assert.equal(sdkPlacement?.click_url, decision.creative.click_through_url ?? null);
    assert.equal(typeof decision.constraints, "object");
    assert.equal(decision.constraints.mode, decision.creative.type);
    assert.equal(typeof decision.constraints.ruleset_id, "string");
    assert.equal(typeof decision.constraints.ruleset_version, "number");
    assert.match(decision.cs_declaration, /^CS-/);
    const beacon = await client.sendBeacon({
      beacon_id: "sdk-rendered-1",
      asset_token: decision.asset_token,
      beacon_type: "rendered",
      occurred_at_ms_client: Date.now(),
    });
    assert.equal(beacon.accepted, true);
    const beaconLogs = server.logs.filter((line) => {
      const parsed = JSON.parse(line) as { path?: string };
      return parsed.path === "/v1/beacons";
    });
    assert.ok(beaconLogs.length >= 1);
  }

  const suppressedErrors: unknown[] = [];
  const loggerEvents: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  const unavailable = new WavebirdClient({
    baseUrl: "http://127.0.0.1:1",
    getApiKey: () => "wrapper-test-key",
    decisionDelivery: "polling",
    options: {
      timeout_ms: 100,
      decision_timeout_ms: 1_000,
      long_poll_wait_ms: 0,
      short_poll_interval_ms: 100,
      logLevel: "debug",
      logger: {
        error: (message, meta) => {
          loggerEvents.push({ level: "error", message, meta });
        },
        info: (message, meta) => {
          loggerEvents.push({ level: "info", message, meta });
        },
        warn: (message, meta) => {
          loggerEvents.push({ level: "warn", message, meta });
        },
      },
      onError: (error) => {
        suppressedErrors.push(error);
      },
    },
  });

  const failedJob = await unavailable.createJob({
    job_type: "chat",
  });
  assert.equal(failedJob, null);

  const pending = await unavailable.getDecision("slot-missing");
  assert.deepEqual(pending, {
    slot_id: "slot-missing",
    fill: null,
    status: "pending",
  });
  assert.equal(packageIndex.normalizeWavebirdPlacement(pending), null);
  assert.deepEqual(
    packageIndex.normalizeWavebirdPlacement({
      slot_id: "slot-canonical",
      status: "ready",
      placement: {
        image_url: "https://api.wavebird.ai/v1/test-assets/banner",
        click_url: "https://example.com",
        sponsor_name: "Demo Sponsor",
        width: 300,
        height: 250,
        format: "banner",
        asset_token: "asset-token-1",
        ad_label_text: "Sponsored",
      },
      decision: { fill: true },
    }),
    {
      image_url: "https://api.wavebird.ai/v1/test-assets/banner",
      click_url: "https://example.com",
      sponsor_name: "Demo Sponsor",
      width: 300,
      height: 250,
      format: "banner",
      asset_token: "asset-token-1",
      ad_label_text: "Sponsored",
    }
  );
  assert.equal(packageIndex.normalizeWavebirdPlacement({ slot_id: "slot-pending", status: "pending", placement: null }), null);

  await unavailable.reportGeneration("job-missing", "failed", {
    error: "network",
  });
  const failedBeacon = await unavailable.sendBeacon({
    beacon_id: "sdk-failed-1",
    asset_token: "invalid",
    beacon_type: "rendered",
    occurred_at_ms_client: 1,
  });
  assert.equal(failedBeacon.accepted, false);
  assert.equal(failedBeacon.reason_code, "SDK_FAIL_SILENT");
  assert.ok(suppressedErrors.length >= 3);
  assert.ok(loggerEvents.some((entry) => entry.level === "error" && entry.meta?.client === "node"));

  const rateLimitedServer = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/jobs") {
      res.statusCode = 429;
      res.setHeader("retry-after", "2");
      res.end(JSON.stringify({ error: "rate_limited" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => rateLimitedServer.listen(0, "127.0.0.1", () => resolve()));
  const rateLimitedAddress = rateLimitedServer.address();
  if (!rateLimitedAddress || typeof rateLimitedAddress === "string") {
    throw new Error("sdk_rate_limited_server_missing_address");
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
      retry_after_ms: 2000,
    });
    assert.ok(rateLimitedLogs.some((entry) => entry.level === "warn" && entry.meta?.retry_after_ms === 2000));
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

  const malformedErrors: Array<{ message: string; code: string; cause: unknown }> = [];
  const malformedServer = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");

    if (req.url === "/v1/jobs") {
      res.end(JSON.stringify({ status: "accepted" }));
      return;
    }

    if (req.url === "/v1/beacons") {
      res.end(JSON.stringify({ accepted: "yes" }));
      return;
    }

    if (req.url === "/v1/decisions/slot-invalid") {
      res.end(JSON.stringify({ slot_id: "slot-invalid", status: "ready", decision: { fill: "true" } }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => malformedServer.listen(0, "127.0.0.1", () => resolve()));
  const malformedAddress = malformedServer.address();
  if (!malformedAddress || typeof malformedAddress === "string") {
    throw new Error("sdk_malformed_server_missing_address");
  }
  try {
    const malformedClient = new WavebirdClient({
      baseUrl: `http://127.0.0.1:${malformedAddress.port}`,
      getApiKey: () => "wrapper-test-key",
      decisionDelivery: "polling",
      options: {
        decision_timeout_ms: 1_000,
        long_poll_wait_ms: 0,
        short_poll_interval_ms: 100,
        onError: (error) => {
          if (error instanceof Error) {
            malformedErrors.push({
              message: error.message,
              code: "code" in error ? String((error as { code?: unknown }).code) : "unknown",
              cause: "cause" in error ? (error as { cause?: unknown }).cause : undefined,
            });
          }
        },
      },
    });

    const malformedJob = await malformedClient.createJob({
      job_type: "chat",
    });
    assert.equal(malformedJob, null);

    const malformedDecision = await malformedClient.getDecision("slot-invalid");
    assert.deepEqual(malformedDecision, {
      slot_id: "slot-invalid",
      fill: null,
      status: "pending",
    });

    const malformedBeacon = await malformedClient.sendBeacon({
      beacon_id: "sdk-malformed-1",
      slot_id: "slot-invalid",
      asset_token: "asset-invalid",
      beacon_type: "rendered",
      occurred_at_ms_client: Date.now(),
    });
    assert.equal(malformedBeacon.accepted, false);
    assert.equal(malformedBeacon.reason_code, "SDK_FAIL_SILENT");

    const malformedCauseMessages = malformedErrors.map((error) =>
      error.cause instanceof Error ? error.cause.message : error.cause
    );
    assert.ok(
      malformedErrors.some(
        (error, index) =>
          error.code === WavebirdSdkErrorCode.INTERNAL && malformedCauseMessages[index] === "sdk_invalid_job_response"
      )
    );
    assert.ok(
      malformedErrors.some(
        (error, index) =>
          error.code === WavebirdSdkErrorCode.INTERNAL && malformedCauseMessages[index] === "sdk_invalid_decision_response"
      )
    );
    assert.ok(
      malformedErrors.some((error) => error.code === WavebirdSdkErrorCode.DECISION_TIMEOUT)
    );
    assert.ok(
      malformedErrors.some(
        (error, index) =>
          error.code === WavebirdSdkErrorCode.INTERNAL && malformedCauseMessages[index] === "sdk_invalid_beacon_response"
      )
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      malformedServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  const wrapperVersionHeaders: Array<{ path: string; value: string | undefined }> = [];
  const wrapperVersionServer = http.createServer((req, res) => {
    wrapperVersionHeaders.push({
      path: (req.url ?? "").split("?")[0] ?? "",
      value: typeof req.headers["x-csl-wrapper-version"] === "string" ? req.headers["x-csl-wrapper-version"] : undefined,
    });
    res.setHeader("content-type", "application/json");

    if (req.url === "/v1/jobs") {
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          job_id: "job-versioned",
          slot_ids: ["slot-versioned"],
          status: "accepted",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          decision_delivery: {
            mode: "polling",
            poll_path_template: "/v1/decisions/{slot_id}",
          },
        })
      );
      return;
    }

    if (req.url?.startsWith("/v1/decisions/slot-versioned")) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          slot_id: "slot-versioned",
          status: "ready",
          decision: {
            fill: true,
            format: "banner",
            asset_token: "asset-versioned",
            delivery_url: "https://cdn.example.com/versioned.png",
            click_url: "https://example.com/versioned",
            sponsor_name: "Versioned Sponsor",
            ad_label_text: "Sponsored",
            mime_type: "image/png",
            dimensions: {
              width: 300,
              height: 250,
            },
            duration_ms: 3_000,
            assets: null,
            constraints: {
              source: "wrapper-version-test",
            },
            cs_declaration: "CS-S (S1/P0)*",
            revenue_estimate: {
              gross_cpm: 9.5,
              estimated_net_per_impression: 0.0076,
              currency: "EUR",
            },
          },
        })
      );
      return;
    }

    if (req.url === "/v1/jobs/job-versioned/generation/failed") {
      res.statusCode = 200;
      res.end(JSON.stringify({ accepted: true }));
      return;
    }

    if (req.url === "/v1/beacons") {
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise<void>((resolve) => wrapperVersionServer.listen(0, "127.0.0.1", () => resolve()));
  const wrapperVersionAddress = wrapperVersionServer.address();
  if (!wrapperVersionAddress || typeof wrapperVersionAddress === "string") {
    throw new Error("sdk_wrapper_version_server_missing_address");
  }
  try {
    const versionedClient = new WavebirdClient({
      baseUrl: `http://127.0.0.1:${wrapperVersionAddress.port}`,
      getApiKey: () => "wrapper-test-key",
      decisionDelivery: "polling",
      options: {
        wrapper_version: "wavebird-wrapper/2026.03",
      },
    });

    const versionedJob = await versionedClient.createJob({
      job_type: "chat",
    });
    assert.ok(versionedJob);

    const versionedDecision = await versionedClient.getDecision("slot-versioned");
    assert.equal(versionedDecision.fill, true);

    await versionedClient.reportGeneration("job-versioned", "failed", {
      error: "versioned-header-test",
    });
    const versionedBeacon = await versionedClient.sendBeacon({
      beacon_id: "sdk-versioned-1",
      asset_token: "asset-versioned",
      beacon_type: "rendered",
      occurred_at_ms_client: Date.now(),
    });
    assert.equal(versionedBeacon.accepted, true);

    assert.deepEqual(
      wrapperVersionHeaders.map((entry) => entry.path),
      [
        "/v1/jobs",
        "/v1/decisions/slot-versioned",
        "/v1/jobs/job-versioned/generation/failed",
        "/v1/beacons",
      ]
    );
    assert.deepEqual(
      wrapperVersionHeaders.map((entry) => entry.value),
      new Array(wrapperVersionHeaders.length).fill("wavebird-wrapper/2026.03")
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      wrapperVersionServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  const callbackErrors: Array<{ message: string; code: string; cause: unknown }> = [];
  const callbackClient = new WavebirdClient({
    baseUrl: server.base_url,
    getApiKey: () => server.wrapper_api_key,
    decisionDelivery: "callback",
    options: {
      onError: (error) => {
        if (error instanceof Error) {
          callbackErrors.push({
            message: error.message,
            code: "code" in error ? String((error as { code?: unknown }).code) : "unknown",
            cause: "cause" in error ? (error as { cause?: unknown }).cause : undefined,
          });
        }
      },
    },
  });
  const callbackJob = await callbackClient.createJob({
    job_type: "chat",
  });
  assert.equal(callbackJob, null);
  assert.ok(
    callbackErrors.some(
      (error) =>
        error.code === WavebirdSdkErrorCode.INTERNAL &&
        error.cause instanceof Error &&
        error.cause.message === "sdk_missing_callback_url"
    )
  );
} finally {
  await server.stop();
}

console.log("sdk/wavebird-client.test.ts ok");
