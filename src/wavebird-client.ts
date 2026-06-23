import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type {
  AcceptedJobResponse,
  BeaconRequest,
  BeaconResponse,
  DecisionResponse,
  DecisionDeliveryMode,
  GenerationEvent,
  GenerationRequest,
  JobRequest,
  JobResponse,
  RateLimitedJobResponse,
  WavebirdDecisionMetadata,
  WavebirdPlacement,
} from "./types.js";
import {
  isCslWrapperBeaconResponseV1,
  isCslWrapperDecisionResponseV1,
  type CslWrapperBeaconRequestV1,
  type CslWrapperBeaconResponseV1,
  type CslWrapperDecisionResponseV1,
} from "./public_contracts.js";
import {
  DEFAULT_WRAPPER_VERSION,
  LOCALHOST_HOSTNAMES,
  WRAPPER_BEACON_CONTRACT_VERSION,
} from "./runtime-constants.js";
import { clampInt } from "./clamp.js";
import { WavebirdSdkError, WavebirdSdkErrorCode } from "./errors.js";
import { createSdkLogger, type WavebirdSdkLogLevel, type WavebirdSdkLogger, type SdkLoggerController } from "./logging.js";
import { warnSdkDeprecation } from "./deprecation.js";

/**
 * Configuration for the Node/server SDK client.
 */
export type WavebirdClientOptions = {
  /** Base URL of the CSL server. Remote targets must use HTTPS. */
  baseUrl: string;
  /** Returns the wrapper API key immediately before each HTTP request. */
  getApiKey: () => string | Promise<string>;
  /** Decision delivery strategy. Defaults to `"auto"`. */
  decisionDelivery?: DecisionDeliveryMode;
  /** Publisher metadata merged into every createJob request unless overridden per call. */
  publisher?: JobRequest["publisher"];
  options?: {
    /** Per-request timeout in milliseconds. Clamped to 250..30_000. Defaults to 2_000. */
    timeout_ms?: number;
    /** Total polling timeout budget in milliseconds. Clamped to 1_000..60_000. Defaults to 30_000. */
    decision_timeout_ms?: number;
    /** Long-poll wait hint in milliseconds. Clamped to 0..5_000. Defaults to 1_500. */
    long_poll_wait_ms?: number;
    /** Initial short-poll interval in milliseconds. Clamped to 100..5_000. Defaults to 250. */
    short_poll_interval_ms?: number;
    /** Observes swallowed SDK failures as structured errors. */
    onError?: (error: WavebirdSdkError) => void;
    /** Logging verbosity. Defaults to `"silent"` unless a custom logger is provided. */
    logLevel?: WavebirdSdkLogLevel;
    /** Optional logger used for structured SDK diagnostics. */
    logger?: WavebirdSdkLogger;
    /** Wrapper version identifier sent via `x-csl-wrapper-version`. Defaults to `"sdk"`. */
    wrapper_version?: string;
  };
};

type JsonResponse<T> = {
  status: number;
  body: T | null;
  headers: Record<string, string | string[] | undefined>;
};

type WebSocketLike = {
  addEventListener: (type: string, listener: (event: { data?: unknown }) => void) => void;
  close: () => void;
};

type WebSocketLikeConstructor = new (url: string) => WebSocketLike;
const MAX_JSON_BYTES = 64 * 1024;
const HTTP_AGENT = new http.Agent({ keepAlive: true });
const HTTPS_AGENT = new https.Agent({ keepAlive: true });
const DEFAULT_CREATIVE_DURATION_MS = 3_000;
const DEFAULT_CREATIVE_WIDTH = 300;
const DEFAULT_CREATIVE_HEIGHT = 250;

type CanonicalV1AcceptedJobResponse = {
  job_id: string;
  slot_ids: string[];
  status: "accepted";
};

type CanonicalV1DecisionResponse =
  | {
      slot_id: string;
      status: "pending";
      decision: null;
      placement?: null;
    }
  | {
      slot_id: string;
      status: "ready";
      decision: {
        fill: false;
        format: null;
        reason: string;
        no_fill_reason: string;
        ad_label_text: string;
        cs_declaration: string;
        metadata?: WavebirdDecisionMetadata;
      };
      placement?: null;
    }
  | {
      slot_id: string;
      status: "ready";
      decision: {
        fill: true;
        format: "clip" | "banner" | "native";
        asset_token: string;
        delivery_url: string | null;
        click_url: string | null;
        sponsor_name: string | null;
        ad_label_text: string;
        mime_type: string | null;
        dimensions: {
          width: number;
          height: number;
        } | null;
        duration_ms: number | null;
        assets: {
          title: string;
          image_url: string;
          description?: string;
          cta_text?: string;
          icon_url?: string;
        } | null;
        constraints: Record<string, unknown>;
        cs_declaration: string;
        revenue_estimate:
          | {
              gross_cpm?: number;
              estimated_net_per_impression?: number;
              currency?: string;
            }
          | null;
        metadata?: WavebirdDecisionMetadata;
      };
      placement?: WavebirdPlacement | null;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : readString(value);
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const entries = value.map((entry) => readString(entry));
  return entries.every((entry) => typeof entry === "string") ? (entries as string[]) : null;
}

function fallbackDecision(slot_id: string): DecisionResponse {
  return {
    slot_id,
    fill: null,
    status: "pending",
  };
}

function fallbackBeacon(): BeaconResponse {
  return {
    accepted: false,
    reason_code: "SDK_FAIL_SILENT",
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = new URL(baseUrl);
  if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
    throw new Error("sdk_invalid_base_url_protocol");
  }
  const isLocalhost = LOCALHOST_HOSTNAMES.has(normalized.hostname);
  if (!isLocalhost && normalized.protocol !== "https:") {
    throw new Error("sdk_insecure_base_url");
  }
  if (normalized.pathname.endsWith("/") && normalized.pathname !== "/") {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }
  const serialized = normalized.toString();
  return normalized.pathname === "/" && serialized.endsWith("/") ? serialized.slice(0, -1) : serialized;
}

function createHttpError(status: number, path: string): WavebirdSdkError {
  return new WavebirdSdkError(
    WavebirdSdkErrorCode.HTTP_ERROR,
    `HTTP request to ${path} failed with status ${status}.`,
    { cause: { status, path } }
  );
}

function toWavebirdSdkError(error: unknown): WavebirdSdkError {
  if (error instanceof WavebirdSdkError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "sdk_internal";
  if (message === "sdk_invalid_json" || message === "sdk_response_too_large") {
    return new WavebirdSdkError(WavebirdSdkErrorCode.PARSE_ERROR, "Response could not be parsed as JSON.", { cause: error });
  }
  if (
    message === "sdk_timeout" ||
    message === "fetch failed" ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new WavebirdSdkError(WavebirdSdkErrorCode.NETWORK_ERROR, "Network request failed.", { cause: error });
  }
  return new WavebirdSdkError(WavebirdSdkErrorCode.INTERNAL, "Internal SDK error.", { cause: error });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return 1_000;
  }
  const normalized = raw.trim();
  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(0, Math.round(seconds * 1000));
  }
  const targetMs = Date.parse(normalized);
  if (Number.isFinite(targetMs)) {
    return Math.max(0, targetMs - Date.now());
  }
  return 1_000;
}

function buildWebSocketUrl(baseUrl: string, path: string, ticket: string): string {
  const httpUrl = new URL(`${normalizeBaseUrl(baseUrl)}${path}`);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  httpUrl.searchParams.set("ticket", ticket);
  return httpUrl.toString();
}

function getGlobalWebSocket(): WebSocketLikeConstructor | null {
  const ctor = (globalThis as typeof globalThis & { WebSocket?: WebSocketLikeConstructor }).WebSocket;
  return typeof ctor === "function" ? ctor : null;
}

function createV1JobRequest(
  params: JobRequest,
  decisionDelivery: DecisionDeliveryMode,
  defaultPublisher?: JobRequest["publisher"]
): Record<string, unknown> {
  if (decisionDelivery === "callback" && !params.callback_url) {
    throw new Error("sdk_missing_callback_url");
  }
  const timing = params.timing ?? params.slot_config?.timing;
  if (timing === "before" || timing === "after") {
    warnSdkDeprecation(
      `stage3Timing:${timing}`,
      `Using '${timing}' timing. wavebird's recommended timing is 'during' for zero-latency ads.`
    );
  }
  const preferred_partner_id = params.routing?.preferred_partner_id ?? params.ssp_partner_id;
  const candidate_partner_ids = params.routing?.candidate_partner_ids;
  const publisher =
    defaultPublisher || params.publisher
      ? {
          ...(defaultPublisher ?? {}),
          ...(params.publisher ?? {}),
        }
      : undefined;
  const context =
    params.context?.topic !== undefined ||
    params.context?.prompt_text !== undefined ||
    params.context?.geo !== undefined ||
    params.context?.device !== undefined
      ? {
          ...(params.context?.topic !== undefined ? { topic: params.context.topic } : {}),
          ...(params.context?.prompt_text !== undefined ? { prompt_text: params.context.prompt_text } : {}),
          ...(params.context?.geo !== undefined ? { geo: { ...params.context.geo } } : {}),
          ...(params.context?.device !== undefined ? { device: { ...params.context.device } } : {}),
        }
      : undefined;
  const prompt =
    params.prompt === undefined
      ? undefined
      : typeof params.prompt === "string"
        ? params.prompt
        : {
            ...(params.prompt.text !== undefined ? { text: params.prompt.text } : {}),
            ...(params.prompt.token_count_estimate !== undefined
              ? { token_count_estimate: params.prompt.token_count_estimate }
              : {}),
          };
  const canUseCanonicalRequest =
    Boolean(params.client_id) &&
    params.model_id === undefined &&
    params.predicted_latency_ms === undefined &&
    params.verification === undefined &&
    params.callback_url === undefined &&
    (!params.consent ||
      Object.keys(params.consent).every((key) => key === "gdpr_applies")) &&
    !params.routing?.candidate_partner_ids?.length &&
    !(typeof params.prompt === "object" && params.prompt !== null && params.prompt.token_count_estimate !== undefined);

  if (canUseCanonicalRequest) {
    const canonicalPrompt =
      params.prompt !== undefined || params.context?.topic !== undefined || params.context?.prompt_text !== undefined
        ? {
            ...(params.context?.topic !== undefined ? { topic: params.context.topic } : {}),
            ...(typeof params.prompt === "string"
              ? { text: params.prompt }
              : params.prompt?.text !== undefined
                ? { text: params.prompt.text }
                : params.context?.prompt_text !== undefined
                  ? { text: params.context.prompt_text }
                  : {}),
          }
        : undefined;
    const overrides: Record<string, unknown> = {};
    if (publisher !== undefined) {
      overrides.publisher = publisher;
    }
    if (params.slot_config?.allowed_formats !== undefined) {
      overrides.allowed_formats = [...params.slot_config.allowed_formats];
    }
    if (params.slot_config?.bidfloor !== undefined) {
      overrides.bidfloor = params.slot_config.bidfloor;
    }
    if (params.slot_config?.bidfloorcur !== undefined) {
      overrides.bidfloor_currency = params.slot_config.bidfloorcur;
    }
    if (timing !== undefined) {
      overrides.timing = timing;
    }
    if (params.slot_config?.bidfloors !== undefined) {
      overrides.bidfloors = { ...params.slot_config.bidfloors };
    }
    if (params.frequency_cap !== undefined) {
      overrides.frequency_cap = { ...params.frequency_cap };
    }
    if (params.targeting !== undefined) {
      overrides.targeting = { ...params.targeting };
    }
    if (params.pacing !== undefined) {
      overrides.pacing = { ...params.pacing };
    }
    if (params.brand_safety?.blocked_categories !== undefined) {
      overrides.blocked_categories = [...params.brand_safety.blocked_categories];
    }
    if (params.brand_safety?.blocked_domains !== undefined) {
      overrides.blocked_domains = [...params.brand_safety.blocked_domains];
    }
    if (preferred_partner_id !== undefined) {
      overrides.preferred_partner_id = preferred_partner_id;
    }
    if (params.consent?.gdpr_applies !== undefined) {
      overrides.gdpr_applies = params.consent.gdpr_applies;
    }

    const slot_hint =
      params.slot_config?.position_hint !== undefined ||
      params.slot_config?.max_width !== undefined ||
      params.slot_config?.max_height !== undefined
        ? {
            ...(params.slot_config?.position_hint !== undefined ? { position: params.slot_config.position_hint } : {}),
            ...(params.slot_config?.max_width !== undefined ? { max_width: params.slot_config.max_width } : {}),
            ...(params.slot_config?.max_height !== undefined ? { max_height: params.slot_config.max_height } : {}),
          }
        : undefined;

    return {
      client_id: params.client_id,
      ...(params.chat_session_id !== undefined ? { session_id: params.chat_session_id } : {}),
      job_type: params.job_type,
      ...(params.locale !== undefined ? { locale: params.locale } : {}),
      slots_requested: params.slots_requested ?? 1,
      ...(canonicalPrompt !== undefined ? { prompt: canonicalPrompt } : {}),
      ...(slot_hint !== undefined ? { slot_hint } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    };
  }

  return {
    job_type: params.job_type,
    slots_requested: params.slots_requested ?? 1,
    ...(params.model_id !== undefined ? { model_id: params.model_id } : {}),
    ...(params.locale !== undefined ? { locale: params.locale } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(params.consent !== undefined ? { consent: params.consent } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(params.client_id !== undefined ? { client_id: params.client_id } : {}),
    ...(params.chat_session_id !== undefined ? { chat_session_id: params.chat_session_id } : {}),
    ...(params.predicted_latency_ms === undefined
      ? {}
      : {
          predicted_latency_ms: params.predicted_latency_ms,
        }),
    ...(preferred_partner_id || candidate_partner_ids?.length
      ? {
          routing: {
            ...(preferred_partner_id ? { preferred_partner_id } : {}),
            ...(candidate_partner_ids?.length ? { candidate_partner_ids: [...candidate_partner_ids] } : {}),
          },
        }
      : {}),
    ...(preferred_partner_id ? { ssp_partner_id: preferred_partner_id } : {}),
    ...(params.callback_url !== undefined ? { callback_url: params.callback_url } : {}),
    ...(publisher !== undefined ? { publisher } : {}),
    ...(params.slot_config !== undefined || timing !== undefined
      ? { slot_config: { ...(params.slot_config ?? {}), ...(timing !== undefined ? { timing } : {}) } }
      : {}),
    ...(params.brand_safety !== undefined ? { brand_safety: { ...params.brand_safety } } : {}),
    ...(params.verification !== undefined ? { verification: params.verification } : {}),
    ...(params.frequency_cap !== undefined ? { frequency_cap: { ...params.frequency_cap } } : {}),
    ...(params.targeting !== undefined ? { targeting: { ...params.targeting } } : {}),
    ...(params.pacing !== undefined ? { pacing: { ...params.pacing } } : {}),
  };
}

function normalizeV1JobResponse(response: unknown): AcceptedJobResponse {
  const record = isRecord(response) ? response : null;
  const job_id = readString(record?.job_id);
  const slot_ids = readStringArray(record?.slot_ids);
  if (!record || !job_id || !slot_ids || record.status !== "accepted") {
    throw new Error("sdk_invalid_job_response");
  }
  return {
    job_id,
    slot_ids,
    status: "accepted",
  };
}

function normalizeRateLimitedJobResponse(headers: JsonResponse<unknown>["headers"]): RateLimitedJobResponse {
  return {
    error: "rate_limit_exceeded",
    retry_after_ms: parseRetryAfterMs(headers["retry-after"]),
  };
}

function createPublicBeaconRequest(beacon: BeaconRequest): CslWrapperBeaconRequestV1 {
  const { beacon_id, asset_token, beacon_type, occurred_at_ms_client, measurements } = beacon;
  return {
    contract_version: WRAPPER_BEACON_CONTRACT_VERSION,
    beacon_id,
    asset_token,
    beacon_type,
    occurred_at_ms_client,
    ...(measurements === undefined ? {} : { measurements }),
  };
}

function normalizePublicBeaconResponse(response: CslWrapperBeaconResponseV1): BeaconResponse {
  return {
    accepted: response.accepted,
    reason_code: response.reason_code,
  };
}

function readCanonicalNativeAssets(value: unknown): {
  title: string;
  image_url: string;
  description?: string;
  cta_text?: string;
  icon_url?: string;
} | null {
  const record = isRecord(value) ? value : null;
  const title = readString(record?.title);
  const image_url = readString(record?.image_url);
  if (!record || !title || !image_url) {
    return null;
  }
  return {
    title,
    image_url,
    ...(readString(record.description) ? { description: readString(record.description)! } : {}),
    ...(readString(record.cta_text) ? { cta_text: readString(record.cta_text)! } : {}),
    ...(readString(record.icon_url) ? { icon_url: readString(record.icon_url)! } : {}),
  };
}

function normalizeV1Decision(response: unknown): DecisionResponse {
  const record = isRecord(response) ? response : null;
  const slot_id = readString(record?.slot_id);
  if (!record || !slot_id) {
    throw new Error("sdk_invalid_decision_response");
  }

  if (record.status === "pending" && record.decision === null) {
    return {
      slot_id,
      status: "pending",
      fill: null,
      ...(isRecord(record.metadata) ? { metadata: record.metadata as WavebirdDecisionMetadata } : {}),
    };
  }

  const decision = isRecord(record.decision) ? record.decision : null;
  if (record.status !== "ready" || !decision || typeof decision.fill !== "boolean") {
    throw new Error("sdk_invalid_decision_response");
  }

  if (decision.fill === false) {
    const reason = readString(decision.reason);
    const no_fill_reason = readString(decision.no_fill_reason);
    const cs_declaration = readString(decision.cs_declaration);
    if (!reason || !no_fill_reason || !cs_declaration) {
      throw new Error("sdk_invalid_decision_response");
    }
    return {
      slot_id,
      status: "ready",
      fill: false,
      reason,
      no_fill_reason,
      cs_declaration,
      ...(isRecord(decision.metadata) ? { metadata: decision.metadata as WavebirdDecisionMetadata } : {}),
    };
  }

  const format = decision.format === "banner" || decision.format === "clip" || decision.format === "native"
    ? decision.format
    : null;
  const asset_token = readString(decision.asset_token);
  const cs_declaration = readString(decision.cs_declaration);
  const constraints = isRecord(decision.constraints) ? decision.constraints : null;
  if (!format || !asset_token || !cs_declaration || !constraints) {
    throw new Error("sdk_invalid_decision_response");
  }

  const dimensionsRecord = decision.dimensions === null ? null : isRecord(decision.dimensions) ? decision.dimensions : undefined;
  if (dimensionsRecord === undefined) {
    throw new Error("sdk_invalid_decision_response");
  }
  const width =
    dimensionsRecord && typeof dimensionsRecord.width === "number" && Number.isFinite(dimensionsRecord.width)
      ? dimensionsRecord.width
      : DEFAULT_CREATIVE_WIDTH;
  const height =
    dimensionsRecord && typeof dimensionsRecord.height === "number" && Number.isFinite(dimensionsRecord.height)
      ? dimensionsRecord.height
      : DEFAULT_CREATIVE_HEIGHT;
  const duration_ms =
    typeof decision.duration_ms === "number" && Number.isFinite(decision.duration_ms)
      ? decision.duration_ms
      : DEFAULT_CREATIVE_DURATION_MS;
  const delivery_url = readNullableString(decision.delivery_url);
  const click_url = readNullableString(decision.click_url);
  const sponsor_name = readNullableString(decision.sponsor_name);
  const mime_type = readNullableString(decision.mime_type);
  const native_assets = decision.assets === null || decision.assets === undefined ? null : readCanonicalNativeAssets(decision.assets);
  const revenue_estimate =
    isRecord(decision.revenue_estimate) || decision.revenue_estimate === null
      ? (decision.revenue_estimate as {
          gross_cpm?: number;
          estimated_net_per_impression?: number;
          currency?: string;
        } | null)
      : undefined;

  if (format === "native" && !native_assets) {
    throw new Error("sdk_invalid_decision_response");
  }
  if (format !== "native" && !delivery_url) {
    throw new Error("sdk_invalid_decision_response");
  }

  return {
    slot_id,
    status: "ready",
    fill: true,
    creative: {
      url: format === "native" ? native_assets!.image_url : delivery_url!,
      type: format,
      duration_ms,
      width,
      height,
      ...(mime_type ? { mime_type } : {}),
      ...(click_url ? { click_through_url: click_url } : {}),
      ...(sponsor_name ? { sponsor_name } : {}),
      ...(native_assets ? { native_assets } : {}),
    },
    asset_token,
    constraints: { ...constraints },
    cs_declaration,
    ...(revenue_estimate === undefined ? {} : { revenue_estimate }),
    ...(isRecord(decision.metadata) ? { metadata: decision.metadata as WavebirdDecisionMetadata } : {}),
  };
}

function mapSdkBeaconTypeToCanonicalEvent(beacon_type: BeaconRequest["beacon_type"]): string | null {
  switch (beacon_type) {
    case "rendered":
      return "rendered";
    case "visible_started":
      return "visible";
    case "heartbeat":
      return "heartbeat";
    case "play_started":
      return "play_started";
    case "play_completed":
      return "play_completed";
    case "clicked":
      return "clicked";
    case "visible_ended":
    default:
      return null;
  }
}

function normalizePublicDecision(response: CslWrapperDecisionResponseV1): DecisionResponse {
  if (response.status === "pending") {
    return {
      slot_id: response.slot_id,
      status: "pending",
      fill: null,
      ...(response.metadata !== undefined ? { metadata: response.metadata as WavebirdDecisionMetadata } : {}),
    };
  }
  if (response.fill === false) {
    return {
      slot_id: response.slot_id,
      status: "ready",
      fill: false,
      reason: response.reason,
      no_fill_reason: response.no_fill_reason,
      cs_declaration: response.cs_declaration,
      ...(response.metadata !== undefined ? { metadata: response.metadata as WavebirdDecisionMetadata } : {}),
    };
  }
  return {
    slot_id: response.slot_id,
    status: "ready",
    fill: true,
    creative: { ...response.creative },
    asset_token: response.asset_token,
    constraints: { ...response.constraints },
    cs_declaration: response.cs_declaration,
    ...(response.revenue_estimate !== undefined ? { revenue_estimate: response.revenue_estimate } : {}),
    ...(response.metadata !== undefined ? { metadata: response.metadata as WavebirdDecisionMetadata } : {}),
  };
}

function expectContract<T>(
  body: unknown,
  guard: (value: unknown) => value is T,
  error: string
): T {
  if (!guard(body)) {
    throw new Error(error);
  }
  return body;
}

async function normalizeWsMessage(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  if (data && typeof (data as { text?: unknown }).text === "function") {
    return String(await (data as { text: () => Promise<string> }).text());
  }
  return String(data ?? "");
}

function requestJson<T>(args: {
  baseUrl: string;
  path: string;
  method: string;
  authorization: string;
  timeout_ms: number;
  wrapper_version: string;
  body?: unknown;
}): Promise<JsonResponse<T>> {
  return new Promise<JsonResponse<T>>((resolve, reject) => {
    let settled = false;
    const settleResolve = (value: JsonResponse<T>): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    const settleReject = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const target = new URL(`${normalizeBaseUrl(args.baseUrl)}${args.path}`);
    const transport = target.protocol === "https:" ? https : http;
    const payload = args.body === undefined ? null : JSON.stringify(args.body);
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: args.method,
        timeout: args.timeout_ms,
        agent: target.protocol === "https:" ? HTTPS_AGENT : HTTP_AGENT,
        headers: {
          accept: "application/json",
          authorization: args.authorization,
          "x-csl-wrapper-version": args.wrapper_version,
          ...(payload === null
            ? {}
            : {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(payload),
              }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        res.on("data", (chunk) => {
          const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
          totalBytes += buffer.byteLength;
          if (totalBytes > MAX_JSON_BYTES) {
            settleReject(new Error("sdk_response_too_large"));
            req.destroy(new Error("sdk_response_too_large"));
            return;
          }
          chunks.push(buffer);
        });
        res.on("error", (error) => {
          settleReject(error);
        });
        res.on("end", () => {
          if (settled) {
            return;
          }
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            settleResolve({
              status: res.statusCode ?? 500,
              body: (raw.length === 0 ? null : JSON.parse(raw)) as T,
              headers: res.headers,
            });
          } catch (error) {
            settleReject(new Error("sdk_invalid_json", { cause: error }));
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("sdk_timeout"));
    });
    req.on("error", (error) => {
      settleReject(error);
    });
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });
}

/**
 * Zero-dependency Node/server client for the CSL wrapper API.
 *
 * The client is designed for fail-silent integration: public request methods return
 * `null`, fallback values, or pending decisions instead of throwing transport errors.
 * Observed failures are delivered through `onError` as `WavebirdSdkError` instances.
 *
 * @example
 * ```ts
 * import { WavebirdClient } from "wavebird";
 *
 * const client = new WavebirdClient({
 *   baseUrl: "https://api.wavebird.ai",
 *   getApiKey: () => process.env.WAVEBIRD_SECRET_KEY ?? "",
 *   publisher: { app_name: "My App", app_domain: "myapp.example" },
 * });
 * ```
 */
export class WavebirdClient {
  private readonly baseUrl: string;
  private readonly getApiKey: () => string | Promise<string>;
  private readonly timeoutMs: number;
  private readonly decisionTimeoutMs: number;
  private readonly longPollWaitMs: number;
  private readonly shortPollIntervalMs: number;
  private readonly onError: ((error: WavebirdSdkError) => void) | undefined;
  private readonly logger: SdkLoggerController;
  private readonly wrapperVersion: string;
  private readonly decisionDelivery: DecisionDeliveryMode;
  private readonly publisher: JobRequest["publisher"];
  private readonly slotIdByAssetToken = new Map<string, string>();

  /**
   * Creates a Node/server SDK instance.
   *
   * @param config - Base URL, credential resolver, delivery strategy, and optional timing overrides.
   */
  constructor(config: WavebirdClientOptions) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.getApiKey = config.getApiKey;
    this.timeoutMs = clampInt(config.options?.timeout_ms, 250, 30_000, 2_000);
    this.decisionTimeoutMs = clampInt(config.options?.decision_timeout_ms, 1_000, 60_000, 30_000);
    this.longPollWaitMs = clampInt(config.options?.long_poll_wait_ms, 0, 5_000, 1_500);
    this.shortPollIntervalMs = clampInt(config.options?.short_poll_interval_ms, 100, 5_000, 250);
    this.onError = config.options?.onError;
    this.logger = createSdkLogger({
      ...(config.options?.logger !== undefined ? { logger: config.options.logger } : {}),
      ...(config.options?.logLevel !== undefined ? { logLevel: config.options.logLevel } : {}),
    });
    this.wrapperVersion = config.options?.wrapper_version ?? DEFAULT_WRAPPER_VERSION;
    this.decisionDelivery = config.decisionDelivery ?? "auto";
    this.publisher = config.publisher;
  }

  private log(level: "error" | "warn" | "info" | "debug", message: string, meta?: Record<string, unknown>): void {
    this.logger.log(level, message, {
      client: "node",
      ...meta,
    });
  }

  private observeError(error: unknown, meta?: Record<string, unknown>): void {
    const sdkError = toWavebirdSdkError(error);
    try {
      this.onError?.(sdkError);
    } catch {
      // keep the SDK fail-silent even when user-supplied observers throw
    }
    this.log("error", sdkError.message, {
      code: sdkError.code,
      cause: sdkError.cause,
      ...meta,
    });
  }

  private async getAuthorizationHeader(): Promise<string> {
    const apiKey = await this.getApiKey();
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new Error("sdk_invalid_api_key");
    }
    return `Bearer ${apiKey}`;
  }

  private rememberDecisionAsset(decision: DecisionResponse): DecisionResponse {
    if (decision.status === "ready" && decision.fill === true) {
      this.slotIdByAssetToken.set(decision.asset_token, decision.slot_id);
    }
    return decision;
  }

  private async createDecisionWsTicket(slotId: string): Promise<string | null> {
    try {
      const authorization = await this.getAuthorizationHeader();
      const response = await requestJson<{ ticket?: unknown }>({
        baseUrl: this.baseUrl,
        path: `/public/wrapper/v1/slots/${encodeURIComponent(slotId)}/decision-ticket`,
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, `/public/wrapper/v1/slots/${slotId}/decision-ticket`), {
          operation: "createDecisionWsTicket",
          path: `/public/wrapper/v1/slots/${slotId}/decision-ticket`,
          slot_id: slotId,
        });
        return null;
      }
      const ticket = response.body?.ticket;
      return typeof ticket === "string" && ticket.trim().length > 0 ? ticket : null;
    } catch (error) {
      this.observeError(error);
      return null;
    }
  }

  private resolveBeaconSlotId(beacon: BeaconRequest): string | null {
    return readString((beacon as BeaconRequest & { slot_id?: string | null }).slot_id) ?? this.slotIdByAssetToken.get(beacon.asset_token) ?? null;
  }

  private async sendLegacyBeacon(beacon: BeaconRequest): Promise<BeaconResponse> {
    const authorization = await this.getAuthorizationHeader();
    const response = await requestJson<CslWrapperBeaconResponseV1>({
      baseUrl: this.baseUrl,
      path: "/public/wrapper/v1/beacons",
      method: "POST",
      authorization,
      timeout_ms: this.timeoutMs,
      wrapper_version: this.wrapperVersion,
      body: createPublicBeaconRequest(beacon),
    });
    if (response.status < 200 || response.status >= 300) {
      this.observeError(createHttpError(response.status, "/public/wrapper/v1/beacons"), {
        operation: "sendBeacon",
        path: "/public/wrapper/v1/beacons",
        beacon_type: beacon.beacon_type,
      });
      return fallbackBeacon();
    }
    return normalizePublicBeaconResponse(
      expectContract(response.body, isCslWrapperBeaconResponseV1, "sdk_invalid_beacon_response")
    );
  }

  /**
   * Creates a wrapper job in CSL.
   *
   * @param params - Wrapper job request in the SDK convenience shape.
   * @returns Accepted job metadata, a typed rate-limit result, or `null` when the request failed.
   * @throws Never. Failures are reported through `onError`.
   *
   * @example
   * ```ts
   * const job = await client.createJob({
   *   job_type: "chat",
   * });
   * ```
   */
  async createJob(params: JobRequest): Promise<JobResponse | null> {
    try {
      const authorization = await this.getAuthorizationHeader();
      const response = await requestJson<CanonicalV1AcceptedJobResponse>({
        baseUrl: this.baseUrl,
        path: "/v1/jobs",
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
        body: createV1JobRequest(params, this.decisionDelivery, this.publisher),
      });
      if (response.status === 429) {
        const rateLimited = normalizeRateLimitedJobResponse(response.headers);
        this.log("warn", "CreateJob request was rate limited.", {
          operation: "createJob",
          path: "/v1/jobs",
          retry_after_ms: rateLimited.retry_after_ms,
        });
        return rateLimited;
      }
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, "/v1/jobs"), {
          operation: "createJob",
          path: "/v1/jobs",
        });
        return null;
      }
      return normalizeV1JobResponse(response.body);
    } catch (error) {
      this.observeError(error);
      return null;
    }
  }

  /**
   * Requests a decision for a slot.
   *
   * The client prefers WebSocket delivery when configured and available, then falls back
   * to polling. When the polling budget is exhausted, a pending fallback decision is returned
   * and `onError` receives `sdk_decision_timeout`.
   *
   * @param slotId - Slot identifier returned by `createJob`.
   * @returns Ready or pending decision state for the slot.
   * @throws Never. Failures are reported through `onError`.
   */
  async getDecision(slotId: string): Promise<DecisionResponse> {
    if (this.decisionDelivery === "auto" || this.decisionDelivery === "websocket") {
      const viaWebSocket = await this.getDecisionViaWebSocket(slotId);
      if (viaWebSocket) {
        return viaWebSocket;
      }
      this.log("info", "Falling back to polling decision delivery.", {
        operation: "getDecision",
        requested_mode: this.decisionDelivery,
        slot_id: slotId,
      });
    }
    return this.getDecisionViaPolling(slotId);
  }

  /**
   * Reports generation lifecycle events for a job.
   *
   * @param jobId - CSL job identifier.
   * @param event - Generation event name.
   * @param request - Optional generation metadata.
   * @returns A promise that resolves after the best-effort report completes.
   * @throws Never. Failures are reported through `onError`.
   */
  async reportGeneration(jobId: string, event: GenerationEvent, request: GenerationRequest = {}): Promise<void> {
    try {
      const authorization = await this.getAuthorizationHeader();
      const response = await requestJson<unknown>({
        baseUrl: this.baseUrl,
        path: `/v1/jobs/${encodeURIComponent(jobId)}/generation/${encodeURIComponent(event)}`,
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
        body: request,
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, `/v1/jobs/${jobId}/generation/${event}`), {
          operation: "reportGeneration",
          path: `/v1/jobs/${jobId}/generation/${event}`,
          job_id: jobId,
          generation_event: event,
        });
      }
    } catch (error) {
      this.observeError(error);
    }
  }

  /**
   * Sends a delivery beacon for a previously assigned asset.
   *
   * @param beacon - Beacon payload sourced from the public wrapper contract.
   * @returns Beacon acceptance state. Failures resolve to a fail-silent fallback.
   * @throws Never. Failures are reported through `onError`.
   */
  async sendBeacon(beacon: BeaconRequest): Promise<BeaconResponse> {
    try {
      const slot_id = this.resolveBeaconSlotId(beacon);
      const event = mapSdkBeaconTypeToCanonicalEvent(beacon.beacon_type);
      if (!slot_id || !event) {
        return await this.sendLegacyBeacon(beacon);
      }
      const authorization = await this.getAuthorizationHeader();
      const response = await requestJson<unknown>({
        baseUrl: this.baseUrl,
        path: "/v1/beacons",
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
        body: {
          beacon_id: beacon.beacon_id,
          slot_id,
          asset_token: beacon.asset_token,
          event,
          occurred_at: new Date(beacon.occurred_at_ms_client).toISOString(),
          ...(beacon.measurements === undefined ? {} : { metadata: beacon.measurements }),
        },
      });
      if (response.status === 204) {
        return {
          accepted: true,
          reason_code: "OK",
        };
      }
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, "/v1/beacons"), {
          operation: "sendBeacon",
          path: "/v1/beacons",
          beacon_type: beacon.beacon_type,
        });
        return fallbackBeacon();
      }
      if (response.body === null) {
        return {
          accepted: true,
          reason_code: "OK",
        };
      }
      return normalizePublicBeaconResponse(
        expectContract(response.body, isCslWrapperBeaconResponseV1, "sdk_invalid_beacon_response")
      );
    } catch (error) {
      this.observeError(error);
      return fallbackBeacon();
    }
  }

  private async getDecisionViaWebSocket(slotId: string): Promise<DecisionResponse | null> {
    const WebSocketCtor = getGlobalWebSocket();
    if (!WebSocketCtor) {
      return null;
    }

    try {
      const ticket = await this.createDecisionWsTicket(slotId);
      if (!ticket) {
        return null;
      }
      return await new Promise<DecisionResponse | null>((resolve) => {
        let settled = false;
        const socket = new WebSocketCtor(
          buildWebSocketUrl(
            this.baseUrl,
            `/public/wrapper/v1/slots/${encodeURIComponent(slotId)}/decision/ws`,
            ticket
          )
        );
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            socket.close();
          } catch {
            // ignore
          }
          resolve(null);
        }, this.decisionTimeoutMs);

        const settle = (decision: DecisionResponse | null): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try {
            socket.close();
          } catch {
            // ignore
          }
          resolve(decision);
        };

        socket.addEventListener("message", (event) => {
          void normalizeWsMessage(event.data)
            .then((text) => {
              const parsed = JSON.parse(text) as unknown;
              settle(
                this.rememberDecisionAsset(
                  normalizePublicDecision(
                    expectContract(parsed, isCslWrapperDecisionResponseV1, "sdk_invalid_decision_response")
                  )
                )
              );
            })
            .catch((error) => {
              this.observeError(error, {
                operation: "getDecisionViaWebSocket",
                slot_id: slotId,
              });
              settle(null);
            });
        });
        socket.addEventListener("error", () => {
          if (settled) {
            return;
          }
          this.observeError(
            new WavebirdSdkError(
              WavebirdSdkErrorCode.WS_CONNECT_FAILED,
              "WebSocket connection could not be established."
            ),
            {
              operation: "getDecisionViaWebSocket",
              slot_id: slotId,
            }
          );
          settle(null);
        });
        socket.addEventListener("close", () => {
          if (!settled) {
            this.observeError(
              new WavebirdSdkError(WavebirdSdkErrorCode.WS_CLOSED, "WebSocket connection was unexpectedly closed."),
              {
                operation: "getDecisionViaWebSocket",
                slot_id: slotId,
              }
            );
            settle(null);
          }
        });
      });
    } catch (error) {
      this.observeError(error);
      return null;
    }
  }

  private async getDecisionViaPolling(slotId: string): Promise<DecisionResponse> {
    const longPollAttempts = this.decisionDelivery === "polling" ? 2 : 1;
    for (let attempt = 0; attempt < longPollAttempts; attempt += 1) {
      const decision = await this.pollDecisionOnce(slotId, this.longPollWaitMs);
      if (decision.status === "ready") {
        return decision;
      }
    }

    const maxShortPollAttempts = Math.min(120, Math.ceil(this.decisionTimeoutMs / this.shortPollIntervalMs));
    for (let attempt = 0; attempt < maxShortPollAttempts; attempt += 1) {
      const decision = await this.pollDecisionOnce(slotId, 0);
      if (decision.status === "ready") {
        return decision;
      }
      if (attempt + 1 < maxShortPollAttempts) {
        const backoffMs = Math.min(this.shortPollIntervalMs * Math.pow(1.5, attempt), 2_000);
        const jitter = Math.floor(Math.random() * 100);
        await delay(backoffMs + jitter);
      }
    }

    this.observeError(
      new WavebirdSdkError(
        WavebirdSdkErrorCode.DECISION_TIMEOUT,
        "Decision polling exceeded the configured timeout budget."
      ),
      {
        operation: "getDecisionViaPolling",
        slot_id: slotId,
      }
    );
    return fallbackDecision(slotId);
  }

  private async pollDecisionOnce(slotId: string, waitMs: number): Promise<DecisionResponse> {
    try {
      const suffix = waitMs > 0 ? `?wait_ms=${waitMs}` : "";
      const authorization = await this.getAuthorizationHeader();
      const response = await requestJson<CanonicalV1DecisionResponse>({
        baseUrl: this.baseUrl,
        path: `/v1/decisions/${encodeURIComponent(slotId)}${suffix}`,
        method: "GET",
        authorization,
        timeout_ms: this.timeoutMs + waitMs,
        wrapper_version: this.wrapperVersion,
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, `/v1/decisions/${slotId}`), {
          operation: "pollDecisionOnce",
          path: `/v1/decisions/${slotId}`,
          slot_id: slotId,
        });
        return fallbackDecision(slotId);
      }
      return this.rememberDecisionAsset(normalizeV1Decision(response.body));
    } catch (error) {
      this.observeError(error, {
        operation: "pollDecisionOnce",
        slot_id: slotId,
      });
      return fallbackDecision(slotId);
    }
  }
}
