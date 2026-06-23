import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type {
  CslWrapperDecisionResponseV1,
  CslWrapperDecisionFillV1,
  CslWrapperDecisionPendingV1,
} from "../src/public_contracts.js";

type JsonRequestArgs = {
  base_url: string;
  path: string;
  method: "GET" | "POST";
  auth_token?: string;
  body?: unknown;
};

type StoredSlot = {
  job_id: string;
  slot_id: string;
  callback_url: string | null;
  decision: CslWrapperDecisionResponseV1 | null;
  waiters: Array<(decision: CslWrapperDecisionResponseV1) => void>;
};

export type LocalTestServer = {
  base_url: string;
  wrapper_api_key: string;
  ssp_api_key: string;
  logs: string[];
  getPublicDecision: (slot_id: string) => CslWrapperDecisionResponseV1 | null;
  waitForPublicDecision: (slot_id: string, timeoutMs?: number) => Promise<CslWrapperDecisionResponseV1>;
  stop: () => Promise<void>;
};

type StartTestServerOptions = {
  auto_dispatch_mock_decisions?: boolean;
};

export function createJoinKey(slot_id: string, args: { secret: string; ssp_partner_id: string }): string {
  const payload = `${args.ssp_partner_id}:${slot_id}`;
  const signature = createHmac("sha256", args.secret).update(payload).digest("hex");
  return `${payload}:${signature}`;
}

export async function jsonRequest(args: JsonRequestArgs): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${args.base_url}${args.path}`, {
    method: args.method,
    headers: {
      ...(args.auth_token ? { authorization: `Bearer ${args.auth_token}` } : {}),
      ...(args.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(args.body === undefined ? {} : { body: JSON.stringify(args.body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? JSON.parse(text) : null,
  };
}

export async function startTestServer(options: StartTestServerOptions = {}): Promise<LocalTestServer> {
  const logs: string[] = [];
  const slots = new Map<string, StoredSlot>();
  let nextJob = 1;

  const autoDispatch = options.auto_dispatch_mock_decisions !== false;
  const wrapper_api_key = "wrapper-test-key";
  const ssp_api_key = "ssp-test-key";
  const joinKeySecret = "join-key-test-secret";

  function log(req: http.IncomingMessage): void {
    logs.push(JSON.stringify({ method: req.method ?? "GET", path: (req.url ?? "").split("?")[0] ?? "" }));
  }

  async function readBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw.length > 0 ? JSON.parse(raw) : null;
  }

  function writeJson(res: http.ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.setHeader("content-length", Buffer.byteLength(json));
    res.end(json);
  }

  function canonicalDecision(slot_id: string, args: Partial<CslWrapperDecisionFillV1> = {}): CslWrapperDecisionFillV1 {
    return {
      contract_version: "csl_wrapper_decision/v1",
      slot_id,
      status: "ready",
      fill: true,
      creative: {
        url: "https://cdn.example.com/sdk-banner.png",
        type: "banner",
        duration_ms: 3_000,
        width: 300,
        height: 250,
        mime_type: "image/png",
        click_through_url: "https://example.com/landing",
        sponsor_name: "Example Sponsor",
      },
      asset_token: `asset_${slot_id}`,
      constraints: {
        mode: "banner",
        ruleset_id: "ruleset-test",
        ruleset_version: 1,
        max_render_delay_ms: 1500,
        require_viewability_ms: 1000,
        creative_duration_ms: 3000,
      },
      cs_declaration: "CS-S (S1/P0)*",
      revenue_estimate: {
        gross_cpm: 9.5,
        estimated_net_per_impression: 0.0076,
        currency: "EUR",
      },
      ...args,
    };
  }

  function pendingDecision(slot_id: string): CslWrapperDecisionPendingV1 {
    return {
      contract_version: "csl_wrapper_decision/v1",
      slot_id,
      status: "pending",
      fill: null,
      reason: null,
      no_fill_reason: null,
      creative: null,
      asset_token: null,
      constraints: null,
      cs_declaration: null,
      revenue_estimate: null,
    };
  }

  function setDecision(slot_id: string, decision: CslWrapperDecisionResponseV1): void {
    const slot = slots.get(slot_id);
    if (!slot) return;
    slot.decision = decision;
    const waiters = slot.waiters.splice(0);
    for (const resolve of waiters) {
      resolve(decision);
    }
    if (slot.callback_url) {
      const payload = JSON.stringify(decision);
      const signature = `sha256=${createHmac("sha256", wrapper_api_key).update(payload, "utf8").digest("hex")}`;
      void fetch(slot.callback_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csl-signature": signature,
        },
        body: payload,
      }).catch(() => undefined);
    }
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      log(req);
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname;

      if (req.method === "POST" && path === "/v1/jobs") {
        const body = await readBody(req);
        const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const job_id = `job_${nextJob}`;
        const slot_id = `slot_${nextJob}`;
        nextJob += 1;
        const callback_url = typeof record.callback_url === "string" ? record.callback_url : null;
        slots.set(slot_id, {
          job_id,
          slot_id,
          callback_url,
          decision: null,
          waiters: [],
        });
        if (autoDispatch) {
          setDecision(slot_id, canonicalDecision(slot_id));
        }
        writeJson(res, 201, {
          job_id,
          slot_ids: [slot_id],
          status: "accepted",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          decision_delivery: {
            mode: callback_url ? "callback" : "polling",
            poll_path_template: "/v1/decisions/{slot_id}",
          },
        });
        return;
      }

      const ticketMatch = path.match(/^\/public\/wrapper\/v1\/slots\/([^/]+)\/decision-ticket$/);
      if (req.method === "POST" && ticketMatch?.[1]) {
        writeJson(res, 200, { ticket: `ticket_${decodeURIComponent(ticketMatch[1])}` });
        return;
      }

      const decisionMatch = path.match(/^\/v1\/decisions\/([^/]+)$/);
      if (req.method === "GET" && decisionMatch?.[1]) {
        const slot_id = decodeURIComponent(decisionMatch[1]);
        const slot = slots.get(slot_id);
        writeJson(res, 200, toCanonicalV1(slot?.decision ?? pendingDecision(slot_id)));
        return;
      }

      if (req.method === "POST" && path === "/v1/beacons") {
        res.statusCode = 204;
        res.end();
        return;
      }

      if (req.method === "POST" && /^\/v1\/jobs\/[^/]+\/generation\/[^/]+$/.test(path)) {
        writeJson(res, 200, { accepted: true });
        return;
      }

      if (req.method === "POST" && path === "/public/wrapper/v1/beacons") {
        writeJson(res, 200, {
          contract_version: "csl_wrapper_beacon/v1",
          accepted: true,
          reason_code: "OK",
        });
        return;
      }

      if (req.method === "POST" && path === "/public/ssp/v1/partners/ssp_local_1/decision") {
        const body = await readBody(req);
        const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
        const join_key = typeof record.join_key === "string" ? record.join_key : "";
        const slot_id = join_key.split(":")[1] ?? "";
        const response = record.response && typeof record.response === "object"
          ? record.response as Record<string, unknown>
          : {};
        const decisionRecord = response.decision && typeof response.decision === "object"
          ? response.decision as Record<string, unknown>
          : {};
        const mode = decisionRecord.mode === "clip" ? "clip" : "banner";
        setDecision(slot_id, canonicalDecision(slot_id, {
          creative: {
            url: typeof decisionRecord.creative_url === "string" ? decisionRecord.creative_url : "https://cdn.example.com/sdk-banner.png",
            type: mode,
            duration_ms: 3_000,
            width: typeof decisionRecord.width === "number" ? decisionRecord.width : 300,
            height: typeof decisionRecord.height === "number" ? decisionRecord.height : 250,
            mime_type: "image/png",
            click_through_url: "https://example.com/landing",
            sponsor_name: "Example Sponsor",
          },
          asset_token: `asset_${slot_id}`,
          constraints: {
            ...(decisionRecord.constraints && typeof decisionRecord.constraints === "object"
              ? decisionRecord.constraints as Record<string, unknown>
              : {}),
            max_render_delay_ms: 1500,
            require_viewability_ms: 1000,
            creative_duration_ms: 3000,
          },
        }));
        writeJson(res, 202, { accepted: true });
        return;
      }

      writeJson(res, 404, { error: "not_found" });
    })().catch((error) => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "internal_error" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as AddressInfo;

  return {
    base_url: `http://127.0.0.1:${address.port}`,
    wrapper_api_key,
    ssp_api_key,
    logs,
    getPublicDecision: (slot_id) => slots.get(slot_id)?.decision ?? null,
    waitForPublicDecision: (slot_id, timeoutMs = 5_000) =>
      new Promise((resolve, reject) => {
        const existing = slots.get(slot_id)?.decision;
        if (existing) {
          resolve(existing);
          return;
        }
        const slot = slots.get(slot_id);
        if (!slot) {
          reject(new Error(`unknown slot ${slot_id}`));
          return;
        }
        const timer = setTimeout(() => reject(new Error(`decision timeout for ${slot_id}`)), timeoutMs);
        slot.waiters.push((decision) => {
          clearTimeout(timer);
          resolve(decision);
        });
      }),
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function toCanonicalV1(decision: CslWrapperDecisionResponseV1): Record<string, unknown> {
  if (decision.status === "pending") {
    return {
      slot_id: decision.slot_id,
      status: "pending",
      decision: null,
      placement: null,
    };
  }
  if (decision.fill === false) {
    return {
      slot_id: decision.slot_id,
      status: "ready",
      decision: {
        fill: false,
        format: null,
        reason: decision.reason,
        no_fill_reason: decision.no_fill_reason,
        ad_label_text: "Sponsored",
        cs_declaration: decision.cs_declaration,
      },
      placement: null,
    };
  }
  return {
    slot_id: decision.slot_id,
    status: "ready",
    decision: {
      fill: true,
      format: decision.creative.type,
      asset_token: decision.asset_token,
      delivery_url: decision.creative.url,
      click_url: decision.creative.click_through_url ?? null,
      sponsor_name: decision.creative.sponsor_name ?? null,
      ad_label_text: "Sponsored",
      mime_type: decision.creative.mime_type ?? null,
      dimensions: {
        width: decision.creative.width,
        height: decision.creative.height,
      },
      duration_ms: decision.creative.duration_ms,
      assets: decision.creative.native_assets ?? null,
      constraints: decision.constraints,
      cs_declaration: decision.cs_declaration,
      revenue_estimate: decision.revenue_estimate ?? null,
    },
    placement: null,
  };
}
