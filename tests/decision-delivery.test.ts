import assert from "node:assert/strict";
import http from "node:http";
import { createHmac } from "node:crypto";
import { WavebirdClient } from "../src/wavebird-client.js";
import { createJoinKey, jsonRequest, startTestServer } from "./_local-test-server.js";

const server = await startTestServer({
  auto_dispatch_mock_decisions: false,
});
const originalWebSocket = (globalThis as unknown as { WebSocket?: unknown }).WebSocket;

try {
  const buildJoinKey = (slot_id: string): string =>
    createJoinKey(slot_id, {
      secret: "join-key-test-secret",
      ssp_partner_id: "ssp_local_1",
    });

  class MockWebSocket {
    private readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

    constructor(url: string) {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/^\/public\/wrapper\/v1\/slots\/([^/]+)\/decision\/ws$/);
      const slot_id = match?.[1] ? decodeURIComponent(match[1]) : "";
      void server.waitForPublicDecision(slot_id).then((decision) => {
        this.emit("message", { data: JSON.stringify(decision) });
      }).catch(() => {
        this.emit("error", {});
      });
    }

    addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
      const current = this.listeners.get(type) ?? [];
      current.push(listener);
      this.listeners.set(type, current);
    }

    close(): void {
      // no-op test transport
    }

    private emit(type: string, event: { data?: unknown }): void {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  const deliverDecision = async (args: {
    slot_id: string;
    decision_id: string;
    creative_url: string;
    constraints?: Record<string, unknown>;
    mode?: "banner" | "clip";
    width?: number;
    height?: number;
  }): Promise<void> => {
    const mode = args.mode ?? "banner";
    await jsonRequest({
      base_url: server.base_url,
      path: "/public/ssp/v1/partners/ssp_local_1/decision",
      method: "POST",
      auth_token: server.ssp_api_key,
      body: {
        contract_version: "csl_ssp_decision_ingress/v1",
        join_key: buildJoinKey(args.slot_id),
        response: {
          contract_version: "csl_ssp_decision_response/v1",
          status: "filled",
          decision: {
            decision_id: args.decision_id,
            creative_url: args.creative_url,
            mode,
            width: args.width ?? 300,
            height: args.height ?? 250,
            deal_id: `${args.decision_id}-deal`,
            price_eur_micro: 2_500,
            ...(args.constraints !== undefined ? { constraints: args.constraints } : {}),
          },
          reason: null,
          reason_origin: null,
          retryable: null,
        },
      },
    });
  };

  const mutableGlobal = globalThis as unknown as { WebSocket?: unknown };
  mutableGlobal.WebSocket = MockWebSocket;

  const explicitWebsocketClient = new WavebirdClient({
    baseUrl: server.base_url,
    getApiKey: () => server.wrapper_api_key,
    decisionDelivery: "websocket",
    options: {
      decision_timeout_ms: 5_000,
      timeout_ms: 1_000,
    },
  });
  const explicitWebsocketJob = await explicitWebsocketClient.createJob({
    job_type: "chat",
    model_id: "gpt-4o-mini",
    locale: "en-US",
    consent: {
      semantic_targeting: true,
      session_persistence: false,
      cross_session_persistence: false,
    },
    prompt: "explicit websocket please",
    slots_requested: 1,
  });
  assert.ok(explicitWebsocketJob);
  const explicitWebsocketLogStart = server.logs.length;
  setTimeout(() => {
    void deliverDecision({
      slot_id: explicitWebsocketJob!.slot_ids[0]!,
      decision_id: "sdk-explicit-websocket-1",
      creative_url: "https://cdn.example/sdk-explicit-websocket.png",
      constraints: {
        delivery_mode: "websocket",
        sequence: 1,
      },
    });
  }, 50);
  const explicitWebsocketDecision = await explicitWebsocketClient.getDecision(explicitWebsocketJob!.slot_ids[0]!);
  assert.equal(explicitWebsocketDecision.fill, true);
  if (explicitWebsocketDecision.fill === true) {
    assert.equal(explicitWebsocketDecision.creative.url, "https://cdn.example/sdk-explicit-websocket.png");
    assert.equal(explicitWebsocketDecision.constraints.delivery_mode, "websocket");
    assert.equal(explicitWebsocketDecision.constraints.sequence, 1);
    assert.equal(typeof explicitWebsocketDecision.constraints.max_render_delay_ms, "number");
    assert.equal(typeof explicitWebsocketDecision.constraints.require_viewability_ms, "number");
    assert.equal(typeof explicitWebsocketDecision.constraints.creative_duration_ms, "number");
    assert.match(explicitWebsocketDecision.cs_declaration, /^CS-/);
  }
  const explicitWebsocketTicketLogs = server.logs.slice(explicitWebsocketLogStart).filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === `/public/wrapper/v1/slots/${explicitWebsocketJob!.slot_ids[0]!}/decision-ticket`;
  });
  assert.ok(explicitWebsocketTicketLogs.length >= 1);
  const explicitWebsocketDecisionLogs = server.logs.slice(explicitWebsocketLogStart).filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === `/public/wrapper/v1/slots/${explicitWebsocketJob!.slot_ids[0]!}/decision`;
  });
  assert.equal(explicitWebsocketDecisionLogs.length, 0);

  const autoClient = new WavebirdClient({
    baseUrl: server.base_url,
    getApiKey: () => server.wrapper_api_key,
    decisionDelivery: "auto",
    options: {
      decision_timeout_ms: 5_000,
      timeout_ms: 1_000,
    },
  });
  const autoJob = await autoClient.createJob({
    job_type: "chat",
    model_id: "gpt-4o-mini",
    locale: "en-US",
    consent: {
      semantic_targeting: true,
      session_persistence: false,
      cross_session_persistence: false,
    },
    prompt: "auto decision please",
    slots_requested: 1,
  });
  assert.ok(autoJob);
  const autoLogStart = server.logs.length;
  setTimeout(() => {
    void deliverDecision({
      slot_id: autoJob!.slot_ids[0]!,
      decision_id: "sdk-auto-1",
      creative_url: "https://cdn.example/sdk-auto.png",
    });
  }, 50);
  const autoDecision = await autoClient.getDecision(autoJob!.slot_ids[0]!);
  assert.equal(autoDecision.fill, true);
  if (autoDecision.fill === true) {
    assert.equal(autoDecision.creative.url, "https://cdn.example/sdk-auto.png");
  }
  const autoTicketLogs = server.logs.slice(autoLogStart).filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === `/public/wrapper/v1/slots/${autoJob!.slot_ids[0]!}/decision-ticket`;
  });
  assert.ok(autoTicketLogs.length >= 1);
  const autoDecisionLogs = server.logs.slice(autoLogStart).filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === `/public/wrapper/v1/slots/${autoJob!.slot_ids[0]!}/decision`;
  });
  assert.equal(autoDecisionLogs.length, 0);

  const explicitPollingClient = new WavebirdClient({
    baseUrl: server.base_url,
    getApiKey: () => server.wrapper_api_key,
    decisionDelivery: "polling",
    options: {
      decision_timeout_ms: 3_000,
      timeout_ms: 1_000,
      long_poll_wait_ms: 200,
      short_poll_interval_ms: 50,
    },
  });
  const explicitPollingJob = await explicitPollingClient.createJob({
    job_type: "chat",
    model_id: "gpt-4o-mini",
    locale: "en-US",
    consent: {
      semantic_targeting: true,
      session_persistence: false,
      cross_session_persistence: false,
    },
    prompt: "explicit polling please",
    slots_requested: 1,
  });
  assert.ok(explicitPollingJob);
  const explicitPollingLogStart = server.logs.length;
  setTimeout(() => {
    void deliverDecision({
      slot_id: explicitPollingJob!.slot_ids[0]!,
      decision_id: "sdk-explicit-polling-1",
      creative_url: "https://cdn.example/sdk-explicit-polling.png",
      constraints: {
        delivery_mode: "polling",
        sequence: 2,
      },
    });
  }, 50);
  const explicitPollingDecision = await explicitPollingClient.getDecision(explicitPollingJob!.slot_ids[0]!);
  assert.equal(explicitPollingDecision.fill, true);
  if (explicitPollingDecision.fill === true) {
    assert.equal(explicitPollingDecision.creative.url, "https://cdn.example/sdk-explicit-polling.png");
    assert.equal(explicitPollingDecision.constraints.delivery_mode, "polling");
    assert.equal(explicitPollingDecision.constraints.sequence, 2);
    assert.equal(typeof explicitPollingDecision.constraints.max_render_delay_ms, "number");
    assert.equal(typeof explicitPollingDecision.constraints.require_viewability_ms, "number");
    assert.equal(typeof explicitPollingDecision.constraints.creative_duration_ms, "number");
    assert.match(explicitPollingDecision.cs_declaration, /^CS-/);
  }
  const explicitPollingTicketLogs = server.logs.slice(explicitPollingLogStart).filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === `/public/wrapper/v1/slots/${explicitPollingJob!.slot_ids[0]!}/decision-ticket`;
  });
  assert.equal(explicitPollingTicketLogs.length, 0);
  const explicitPollingDecisionLogs = server.logs.slice(explicitPollingLogStart).filter((line) => {
    const parsed = JSON.parse(line) as { path?: string };
    return parsed.path === `/v1/decisions/${explicitPollingJob!.slot_ids[0]!}`;
  });
  assert.ok(explicitPollingDecisionLogs.length >= 1);

  mutableGlobal.WebSocket = undefined;
  try {
    const fallbackClient = new WavebirdClient({
      baseUrl: server.base_url,
      getApiKey: () => server.wrapper_api_key,
      decisionDelivery: "auto",
      options: {
        decision_timeout_ms: 3_000,
        timeout_ms: 1_000,
        long_poll_wait_ms: 200,
        short_poll_interval_ms: 50,
      },
    });
    const fallbackJob = await fallbackClient.createJob({
      job_type: "chat",
      model_id: "gpt-4o-mini",
      locale: "en-US",
      consent: {
        semantic_targeting: true,
        session_persistence: false,
        cross_session_persistence: false,
      },
      prompt: "polling fallback please",
      slots_requested: 1,
    });
    assert.ok(fallbackJob);
    const fallbackLogStart = server.logs.length;
    setTimeout(() => {
      void deliverDecision({
        slot_id: fallbackJob!.slot_ids[0]!,
        decision_id: "sdk-polling-1",
        creative_url: "https://cdn.example/sdk-polling.png",
      });
    }, 50);
    const fallbackDecision = await fallbackClient.getDecision(fallbackJob!.slot_ids[0]!);
    assert.equal(fallbackDecision.fill, true);
    const fallbackTicketLogs = server.logs.slice(fallbackLogStart).filter((line) => {
      const parsed = JSON.parse(line) as { path?: string };
      return parsed.path === `/public/wrapper/v1/slots/${fallbackJob!.slot_ids[0]!}/decision-ticket`;
    });
    assert.equal(fallbackTicketLogs.length, 0);
    const fallbackDecisionLogs = server.logs.slice(fallbackLogStart).filter((line) => {
      const parsed = JSON.parse(line) as { path?: string };
      return parsed.path === `/v1/decisions/${fallbackJob!.slot_ids[0]!}`;
    });
    assert.ok(fallbackDecisionLogs.length >= 1);
  } finally {
    mutableGlobal.WebSocket = MockWebSocket;
  }

  const callbackReceipts: Array<{ signature?: string; payload: string }> = [];
  const callbackServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      const signature = typeof req.headers["x-csl-signature"] === "string" ? req.headers["x-csl-signature"] : undefined;
      callbackReceipts.push({
        payload: Buffer.concat(chunks).toString("utf8"),
        ...(signature !== undefined ? { signature } : {}),
      });
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => callbackServer.listen(0, "127.0.0.1", () => resolve()));
  const callbackAddress = callbackServer.address();
  if (!callbackAddress || typeof callbackAddress === "string") {
    throw new Error("sdk_callback_server_missing_address");
  }
  try {
    const callbackClient = new WavebirdClient({
      baseUrl: server.base_url,
      getApiKey: () => server.wrapper_api_key,
      decisionDelivery: "callback",
    });
    const callbackJob = await callbackClient.createJob({
      job_type: "chat",
      model_id: "gpt-4o-mini",
      locale: "en-US",
      consent: {
        semantic_targeting: true,
        session_persistence: false,
        cross_session_persistence: false,
      },
      prompt: "callback please",
      callback_url: `http://127.0.0.1:${callbackAddress.port}/decision`,
      slots_requested: 1,
    });
    assert.ok(callbackJob);
    await deliverDecision({
      slot_id: callbackJob!.slot_ids[0]!,
      decision_id: "sdk-callback-1",
      creative_url: "https://cdn.example/sdk-callback.png",
    });
    const callbackPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("sdk_callback_timeout")), 5_000);
      const poll = setInterval(() => {
        if (callbackReceipts.length >= 1) {
          clearTimeout(timeout);
          clearInterval(poll);
          resolve();
        }
      }, 50);
      poll.unref?.();
    });
    await callbackPromise;
    assert.equal(callbackReceipts.length, 1);
    const signature = `sha256=${createHmac("sha256", server.wrapper_api_key)
      .update(callbackReceipts[0]!.payload, "utf8")
      .digest("hex")}`;
    assert.equal(callbackReceipts[0]!.signature, signature);
    const callbackPayload = JSON.parse(callbackReceipts[0]!.payload) as {
      slot_id: string;
      fill: boolean;
      creative: { url: string };
    };
    assert.equal(callbackPayload.slot_id, callbackJob!.slot_ids[0]!);
    assert.equal(callbackPayload.fill, true);
    assert.equal(callbackPayload.creative.url, "https://cdn.example/sdk-callback.png");
  } finally {
    await new Promise<void>((resolve, reject) => {
      callbackServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
} finally {
  (globalThis as unknown as { WebSocket?: unknown }).WebSocket = originalWebSocket;
  await server.stop();
}

console.log("sdk/decision-delivery.test.ts ok");
