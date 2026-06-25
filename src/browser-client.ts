import type {
  AcceptedJobResponse,
  BeaconRequest,
  BeaconResponse,
  DecisionDeliveryMode,
  DecisionResponse,
  GenerationEvent,
  GenerationRequest,
  JobRequest,
  JobResponse,
  RateLimitedJobResponse,
  WavebirdDecisionMetadata,
} from "./types.js";
import type {
  CslWrapperBeaconRequestV1,
  CslWrapperBeaconResponseV1,
  CslWrapperDecisionResponseV1,
  CslWrapperGenerationEventRequestV1,
  CslWrapperIngressAcceptedResponseV1,
  CslWrapperIngressCreateRequestV1,
} from "./public_contracts.js";
import {
  isCslWrapperBeaconResponseV1,
  isCslWrapperDecisionResponseV1,
  isCslWrapperIngressAcceptedResponseV1,
} from "./public_contracts.js";
import {
  DEFAULT_WRAPPER_VERSION,
  LOCALHOST_HOSTNAMES,
  WRAPPER_BEACON_CONTRACT_VERSION,
  WRAPPER_GENERATION_EVENT_CONTRACT_VERSION,
  WRAPPER_INGRESS_CREATE_CONTRACT_VERSION,
} from "./runtime-constants.js";
import { clampInt } from "./clamp.js";
import { WavebirdSdkError, WavebirdSdkErrorCode } from "./errors.js";
import { createSdkLogger, type WavebirdSdkLogLevel, type WavebirdSdkLogger, type SdkLoggerController } from "./logging.js";
import { warnSdkDeprecation } from "./deprecation.js";
import {
  collectBrowserVerification,
  DEFAULT_HUMAN_VERIFICATION_MODE,
  evaluateHumanVerificationRequirement,
  type BrowserHumanVerificationConfig,
} from "./browser-verification.js";

const MAX_JSON_BYTES = 64 * 1024;

/**
 * Configuration for the browser SDK client.
 */
export type WavebirdClientOptions = {
  /** Base URL of the wavebird API. Remote targets must use HTTPS. */
  baseUrl: string;
  /** Returns the publishable browser key immediately before activation. */
  getPublishableKey?: () => string | Promise<string>;
  /** Static publishable browser key used for activation. */
  publishableKey?: string;
  /** Deprecated legacy wrapper API key resolver. */
  getApiKey?: () => string | Promise<string>;
  /** Deprecated legacy static wrapper API key. */
  apiKey?: string;
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
    /** Static origin override used for activation and browser-authenticated requests. */
    origin?: string;
    /** Dynamic origin resolver used for activation and browser-authenticated requests. */
    getOrigin?: () => string | Promise<string>;
    /** Refresh skew applied before activation expiry. Defaults to 5 seconds. */
    activation_refresh_skew_ms?: number;
    /** Optional browser-side human verification gate for createJob. */
    humanVerification?: BrowserHumanVerificationConfig;
  };
};

type JsonResponse<T> = {
  status: number;
  body: T | null;
  headers: Headers;
};

type BrowserActivationResponse = {
  activation_token?: unknown;
  expires_at_ms?: unknown;
};

function fallbackDecision(slotId: string): DecisionResponse {
  return {
    slot_id: slotId,
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

function resolveStaticOrigin(): string | null {
  if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
    const origin = window.location.origin.trim();
    return origin.length > 0 ? origin : null;
  }
  if (typeof globalThis.location?.origin === "string") {
    const origin = globalThis.location.origin.trim();
    return origin.length > 0 ? origin : null;
  }
  return null;
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
    (error instanceof Error && (error.name === "AbortError" || error.name === "TypeError"))
  ) {
    return new WavebirdSdkError(WavebirdSdkErrorCode.NETWORK_ERROR, "Network request failed.", { cause: error });
  }
  return new WavebirdSdkError(WavebirdSdkErrorCode.INTERNAL, "Internal SDK error.", { cause: error });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(value: string | null): number {
  if (!value || value.trim().length === 0) {
    return 1_000;
  }
  const normalized = value.trim();
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
  const target = new URL(`${normalizeBaseUrl(baseUrl)}${path}`);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  target.searchParams.set("ticket", ticket);
  return target.toString();
}

function hasGlobalWebSocket(): boolean {
  return typeof WebSocket === "function";
}

function resolvePublicDecisionDeliveryMode(args: {
  decisionDelivery: DecisionDeliveryMode;
  callback_url?: string | null | undefined;
  allowCallback?: boolean;
}): NonNullable<CslWrapperIngressCreateRequestV1["delivery"]>["mode"] {
  if (args.decisionDelivery === "callback") {
    if (args.allowCallback === false) {
      throw new Error("sdk_callback_not_supported");
    }
    if (!args.callback_url) {
      throw new Error("sdk_missing_callback_url");
    }
    return "callback";
  }
  if (args.callback_url) {
    if (args.allowCallback === false) {
      throw new Error("sdk_callback_not_supported");
    }
    return "callback";
  }
  if (args.decisionDelivery === "websocket") {
    return "websocket";
  }
  if (args.decisionDelivery === "auto" && hasGlobalWebSocket()) {
    return "websocket";
  }
  return "polling";
}

function createPublicJobRequest(
  params: JobRequest,
  decisionDelivery: DecisionDeliveryMode,
  options: { allowCallback?: boolean; defaultPublisher?: JobRequest["publisher"] } = {}
): CslWrapperIngressCreateRequestV1 {
  const preferred_partner_id = params.routing?.preferred_partner_id ?? params.ssp_partner_id;
  const candidate_partner_ids = params.routing?.candidate_partner_ids;
  const timing = params.timing ?? params.slot_config?.timing;
  if (timing === "before" || timing === "after") {
    warnSdkDeprecation(
      `stage3Timing:${timing}`,
      `Using '${timing}' timing. wavebird's recommended timing is 'during' for zero-latency ads.`
    );
  }
  const delivery_mode = resolvePublicDecisionDeliveryMode({
    decisionDelivery,
    callback_url: params.callback_url,
    ...(options.allowCallback !== undefined ? { allowCallback: options.allowCallback } : {}),
  });
  const publisher =
    options.defaultPublisher || params.publisher
      ? {
          ...(options.defaultPublisher ?? {}),
          ...(params.publisher ?? {}),
        }
      : undefined;
  const context =
    params.client_id ||
    params.chat_session_id ||
    params.context?.topic !== undefined ||
    params.context?.prompt_text !== undefined ||
    params.context?.geo !== undefined ||
    params.context?.device !== undefined
      ? {
          ...(params.client_id ? { client_id: params.client_id } : {}),
          ...(params.chat_session_id ? { chat_session_id: params.chat_session_id } : {}),
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

  return {
    contract_version: WRAPPER_INGRESS_CREATE_CONTRACT_VERSION,
    job: {
      job_type: params.job_type,
      slots_requested: params.slots_requested ?? 1,
      ...(params.model_id !== undefined ? { model_id: params.model_id } : {}),
      ...(params.locale !== undefined ? { locale: params.locale } : {}),
    },
    ...(prompt !== undefined ? { prompt } : {}),
    ...(params.consent !== undefined ? { consent: params.consent } : {}),
    ...(context !== undefined ? { context } : {}),
    ...(params.predicted_latency_ms === undefined
      ? {}
      : {
          latency_hint: {
            predicted_latency_ms: params.predicted_latency_ms,
          },
        }),
    ...(preferred_partner_id || candidate_partner_ids?.length
      ? {
          routing_hint: {
            ...(preferred_partner_id ? { preferred_partner_id } : {}),
            ...(candidate_partner_ids?.length ? { candidate_partner_ids: [...candidate_partner_ids] } : {}),
          },
        }
      : {}),
    delivery:
      delivery_mode === "callback"
        ? {
            mode: "callback",
            callback_url: params.callback_url ?? null,
          }
        : {
            mode: delivery_mode,
          },
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

function normalizePublicJobResponse(response: CslWrapperIngressAcceptedResponseV1): AcceptedJobResponse {
  return {
    job_id: response.job_id,
    slot_ids: [...response.slot_ids],
    status: response.status,
  };
}

function normalizeRateLimitedJobResponse(headers: Headers): RateLimitedJobResponse {
  return {
    error: "rate_limit_exceeded",
    retry_after_ms: parseRetryAfterMs(headers.get("retry-after")),
  };
}

function createPublicGenerationRequest(
  event: GenerationEvent,
  request: GenerationRequest
): CslWrapperGenerationEventRequestV1 {
  const { generation_id, model_id, usage_json, error } = request;
  return {
    contract_version: WRAPPER_GENERATION_EVENT_CONTRACT_VERSION,
    generation_event: event,
    ...(generation_id === undefined ? {} : { generation_id }),
    ...(model_id === undefined ? {} : { model_id }),
    ...(usage_json === undefined ? {} : { usage_json }),
    ...(error === undefined ? {} : { error }),
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

async function requestJson<T>(args: {
  baseUrl: string;
  path: string;
  method: string;
  authorization?: string;
  timeout_ms: number;
  wrapper_version: string;
  body?: unknown;
  keepalive?: boolean;
}): Promise<JsonResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("sdk_timeout"), args.timeout_ms);
  try {
    const response = await fetch(`${normalizeBaseUrl(args.baseUrl)}${args.path}`, {
      method: args.method,
      headers: {
        accept: "application/json",
        "x-csl-wrapper-version": args.wrapper_version,
        ...(args.authorization ? { authorization: args.authorization } : {}),
        ...(args.body === undefined ? {} : { "content-type": "application/json" }),
      },
      signal: controller.signal,
      ...(args.keepalive ? { keepalive: true } : {}),
      ...(args.body === undefined ? {} : { body: JSON.stringify(args.body) }),
    });
    const reader = response.body?.getReader();
    if (!reader) {
      return {
        status: response.status,
        body: null,
        headers: response.headers,
      };
    }
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = value ?? new Uint8Array(0);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_JSON_BYTES) {
        await reader.cancel("sdk_response_too_large");
        throw new Error("sdk_response_too_large");
      }
      chunks.push(chunk);
    }
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(merged);
    try {
      return {
        status: response.status,
        body: text.length === 0 ? null : (JSON.parse(text) as T),
        headers: response.headers,
      };
    } catch (error) {
      throw new Error("sdk_invalid_json", { cause: error });
    }
  } finally {
    clearTimeout(timer);
  }
}

async function normalizeWsMessage(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Blob) {
    return data.text();
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }
  return String(data ?? "");
}

/**
 * Browser-native wavebird client built on `fetch`, `AbortController`, and `WebSocket`.
 *
 * Compared with the Node client, this variant uses browser networking primitives
 * instead of Node keep-alive agents. Public request methods remain fail-silent and
 * report transport problems through `onError`.
 */
export class WavebirdClient {
  private readonly baseUrl: string;
  private readonly getApiKey: (() => string | Promise<string>) | null;
  private readonly getPublishableKey: (() => string | Promise<string>) | null;
  private readonly timeoutMs: number;
  private readonly decisionTimeoutMs: number;
  private readonly longPollWaitMs: number;
  private readonly shortPollIntervalMs: number;
  private readonly onError: ((error: WavebirdSdkError) => void) | undefined;
  private readonly logger: SdkLoggerController;
  private readonly wrapperVersion: string;
  private readonly decisionDelivery: DecisionDeliveryMode;
  private readonly getOrigin: (() => string | Promise<string>) | null;
  private readonly activationRefreshSkewMs: number;
  private readonly humanVerification: BrowserHumanVerificationConfig | undefined;
  private readonly publisher: JobRequest["publisher"];
  private activation: { token: string; expires_at_ms: number; origin: string } | null = null;

  /**
   * Creates a browser SDK instance.
   *
   * @param config - Base URL, credential resolver, delivery strategy, and optional timing overrides.
   */
  constructor(config: WavebirdClientOptions) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.getPublishableKey =
      typeof config.getPublishableKey === "function"
        ? config.getPublishableKey
        : typeof config.publishableKey === "string"
          ? () => config.publishableKey as string
          : null;
    this.getApiKey =
      typeof config.getApiKey === "function"
        ? config.getApiKey
        : typeof config.apiKey === "string"
          ? () => config.apiKey as string
          : null;
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
    this.getOrigin =
      typeof config.options?.getOrigin === "function"
        ? config.options.getOrigin
        : typeof config.options?.origin === "string"
          ? () => config.options?.origin as string
          : null;
    this.activationRefreshSkewMs = clampInt(config.options?.activation_refresh_skew_ms, 0, 60_000, 5_000);
    this.humanVerification = config.options?.humanVerification;
  }

  private log(level: "error" | "warn" | "info" | "debug", message: string, meta?: Record<string, unknown>): void {
    this.logger.log(level, message, {
      client: "browser",
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

  private async resolveOrigin(): Promise<string> {
    const origin =
      (this.getOrigin ? await this.getOrigin() : null) ??
      resolveStaticOrigin();
    if (typeof origin !== "string" || origin.trim().length === 0) {
      throw new Error("sdk_missing_origin");
    }
    return origin.trim().toLowerCase();
  }

  private async getLegacyAuthorizationHeader(): Promise<string> {
    if (!this.getApiKey) {
      throw new Error("sdk_invalid_api_key");
    }
    const apiKey = await this.getApiKey();
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new Error("sdk_invalid_api_key");
    }
    return `Bearer ${apiKey.trim()}`;
  }

  private async getBrowserActivationAuthorization(): Promise<string> {
    if (!this.getPublishableKey) {
      throw new Error("sdk_invalid_publishable_key");
    }
    const publishableKey = await this.getPublishableKey();
    if (typeof publishableKey !== "string" || publishableKey.trim().length === 0) {
      throw new Error("sdk_invalid_publishable_key");
    }
    const origin = await this.resolveOrigin();
    if (
      this.activation &&
      this.activation.origin === origin &&
      this.activation.expires_at_ms > Date.now() + this.activationRefreshSkewMs
    ) {
      this.log("debug", "Reusing browser activation token.", {
        operation: "getBrowserActivationAuthorization",
        origin,
      });
      return `Bearer ${this.activation.token}`;
    }
    const response = await requestJson<BrowserActivationResponse>({
      baseUrl: this.baseUrl,
      path: "/v1/browser/activate",
      method: "POST",
      timeout_ms: this.timeoutMs,
      wrapper_version: this.wrapperVersion,
      body: {
        publishable_key: publishableKey.trim(),
      },
    });
    if (response.status < 200 || response.status >= 300) {
      throw createHttpError(response.status, "/v1/browser/activate");
    }
    const activation_token = response.body?.activation_token;
    const expires_at_ms = response.body?.expires_at_ms;
    if (typeof activation_token !== "string" || activation_token.trim().length === 0) {
      throw new Error("sdk_invalid_activation_response");
    }
    if (typeof expires_at_ms !== "number" || !Number.isFinite(expires_at_ms)) {
      throw new Error("sdk_invalid_activation_response");
    }
    this.activation = {
      token: activation_token.trim(),
      expires_at_ms,
      origin,
    };
    this.log("info", "Activated browser session.", {
      operation: "getBrowserActivationAuthorization",
      origin,
      expires_at_ms,
    });
    return `Bearer ${this.activation.token}`;
  }

  private usesBrowserActivation(): boolean {
    return Boolean(this.getPublishableKey);
  }

  private async getAuthorizationHeader(): Promise<string> {
    if (this.usesBrowserActivation()) {
      return this.getBrowserActivationAuthorization();
    }
    return this.getLegacyAuthorizationHeader();
  }

  private pathFor(base: string): string {
    if (!this.usesBrowserActivation()) {
      return base;
    }
    if (base === "/public/wrapper/v1/jobs") {
      return "/v1/jobs";
    }
    return base.replace("/public/wrapper/v1/", "/public/browser/v1/");
  }

  private async createDecisionWsTicket(slotId: string): Promise<string | null> {
    try {
      const authorization = await this.getAuthorizationHeader();
      const path = this.pathFor(`/public/wrapper/v1/slots/${encodeURIComponent(slotId)}/decision-ticket`);
      const response = await requestJson<{ ticket?: unknown }>({
        baseUrl: this.baseUrl,
        path,
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, path), {
          operation: "createDecisionWsTicket",
          path,
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

  /**
   * Creates a wrapper job in wavebird.
   *
   * @param params - Wrapper job request in the SDK convenience shape.
   * @returns Accepted job metadata, a typed rate-limit result, or `null` when the request failed.
   * @throws Never. Failures are reported through `onError`.
   */
  async createJob(params: JobRequest): Promise<JobResponse | null> {
    try {
      const collectedVerification = collectBrowserVerification(this.humanVerification);
      const mergedDevice =
        params.verification?.device || collectedVerification?.device
          ? {
              ...(params.verification?.device ?? {}),
              ...(collectedVerification?.device ?? {}),
            }
          : null;
      const mergedHuman =
        params.verification?.human || collectedVerification?.human || this.humanVerification?.mode
          ? {
              ...(params.verification?.human ?? {}),
              ...(collectedVerification?.human ?? {}),
              mode:
                params.verification?.human?.mode ??
                this.humanVerification?.mode ??
                collectedVerification?.human?.mode ??
                DEFAULT_HUMAN_VERIFICATION_MODE,
            }
          : null;
      const mergedVerification =
        mergedDevice || mergedHuman
          ? {
              ...(mergedDevice ? { device: mergedDevice } : {}),
              ...(mergedHuman ? { human: mergedHuman } : {}),
            }
          : undefined;
      const verificationCheck = evaluateHumanVerificationRequirement({
        ...(mergedVerification !== undefined ? { verification: mergedVerification } : {}),
        ...(this.humanVerification?.mode !== undefined ? { mode: this.humanVerification.mode } : {}),
        ...(this.humanVerification?.max_interaction_age_ms !== undefined
          ? { max_interaction_age_ms: this.humanVerification.max_interaction_age_ms }
          : {}),
      });
      if (!verificationCheck.ok) {
        const message =
          verificationCheck.reason === "trusted_interaction_stale"
            ? "Browser human verification expired before createJob."
            : "Browser human verification requires a recent trusted interaction before createJob.";
        this.observeError(
          new WavebirdSdkError(WavebirdSdkErrorCode.VERIFICATION_REQUIRED, message, {
            cause: new Error(verificationCheck.reason),
          }),
          {
            operation: "createJob",
            verification_reason: verificationCheck.reason,
          }
        );
        return null;
      }
      const authorization = await this.getAuthorizationHeader();
      const path = this.pathFor("/public/wrapper/v1/jobs");
      const requestBody = createPublicJobRequest(
        mergedVerification !== undefined ? { ...params, verification: mergedVerification } : params,
        this.decisionDelivery,
        {
          allowCallback: !this.usesBrowserActivation(),
          defaultPublisher: this.publisher,
        }
      );
      const response = await requestJson<CslWrapperIngressAcceptedResponseV1>({
        baseUrl: this.baseUrl,
        path,
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
        body: requestBody,
      });
      if (response.status === 429) {
        const rateLimited = normalizeRateLimitedJobResponse(response.headers);
        this.log("warn", "CreateJob request was rate limited.", {
          operation: "createJob",
          path,
          retry_after_ms: rateLimited.retry_after_ms,
        });
        return rateLimited;
      }
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, path), {
          operation: "createJob",
          path,
        });
        return null;
      }
      return normalizePublicJobResponse(
        expectContract(response.body, isCslWrapperIngressAcceptedResponseV1, "sdk_invalid_job_response")
      );
    } catch (error) {
      this.observeError(error);
      return null;
    }
  }

  /**
   * Requests a decision for a slot.
   *
   * The browser client prefers WebSocket delivery when configured and available, then falls back
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
   * @param jobId - wavebird job identifier.
   * @param event - Generation event name.
   * @param request - Optional generation metadata.
   * @returns A promise that resolves after the best-effort report completes.
   * @throws Never. Failures are reported through `onError`.
   */
  async reportGeneration(jobId: string, event: GenerationEvent, request: GenerationRequest = {}): Promise<void> {
    try {
      const authorization = await this.getAuthorizationHeader();
      const path = this.pathFor(`/public/wrapper/v1/jobs/${encodeURIComponent(jobId)}/generation`);
      const response = await requestJson({
        baseUrl: this.baseUrl,
        path,
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
        body: createPublicGenerationRequest(event, request),
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, path), {
          operation: "reportGeneration",
          path,
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
      const authorization = await this.getAuthorizationHeader();
      const path = this.pathFor("/public/wrapper/v1/beacons");
      const response = await requestJson<CslWrapperBeaconResponseV1>({
        baseUrl: this.baseUrl,
        path,
        method: "POST",
        authorization,
        timeout_ms: this.timeoutMs,
        wrapper_version: this.wrapperVersion,
        body: createPublicBeaconRequest(beacon),
        keepalive: true,
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, path), {
          operation: "sendBeacon",
          path,
          beacon_type: beacon.beacon_type,
          keepalive: true,
        });
        return fallbackBeacon();
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
    if (!hasGlobalWebSocket()) {
      return null;
    }

    try {
      const ticket = await this.createDecisionWsTicket(slotId);
      if (!ticket) {
        return null;
      }
      return await new Promise<DecisionResponse | null>((resolve) => {
        let settled = false;
        const socket = new WebSocket(buildWebSocketUrl(
          this.baseUrl,
          this.pathFor(`/public/wrapper/v1/slots/${encodeURIComponent(slotId)}/decision/ws`),
          ticket
        ));
        const timer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            socket.close();
          } catch {
            // ignore
          }
          resolve(null);
        }, this.decisionTimeoutMs);

        const settle = (decision: DecisionResponse | null): void => {
          if (settled) {
            return;
          }
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
                normalizePublicDecision(
                  expectContract(parsed, isCslWrapperDecisionResponseV1, "sdk_invalid_decision_response")
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
      const path = this.pathFor(`/public/wrapper/v1/slots/${encodeURIComponent(slotId)}/decision${suffix}`);
      const errorPath = this.pathFor(`/public/wrapper/v1/slots/${encodeURIComponent(slotId)}/decision`);
      const response = await requestJson<CslWrapperDecisionResponseV1>({
        baseUrl: this.baseUrl,
        path,
        method: "GET",
        authorization,
        timeout_ms: this.timeoutMs + waitMs,
        wrapper_version: this.wrapperVersion,
      });
      if (response.status < 200 || response.status >= 300) {
        this.observeError(createHttpError(response.status, errorPath), {
          operation: "pollDecisionOnce",
          path: errorPath,
          slot_id: slotId,
        });
        return fallbackDecision(slotId);
      }
      return normalizePublicDecision(
        expectContract(response.body, isCslWrapperDecisionResponseV1, "sdk_invalid_decision_response")
      );
    } catch (error) {
      this.observeError(error, {
        operation: "pollDecisionOnce",
        slot_id: slotId,
      });
      return fallbackDecision(slotId);
    }
  }
}
