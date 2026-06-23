import type {
  PublicBrowserDeviceSignals,
  PublicHumanVerificationMode,
  PublicHumanVerificationSignals,
  PublicVerificationSignals,
} from "./public_contracts.js";

export type BrowserHumanVerificationConfig = {
  mode?: PublicHumanVerificationMode;
  max_interaction_age_ms?: number;
};

export type BrowserInteractionKind = "pointer" | "keyboard" | "touch";

export const DEFAULT_HUMAN_VERIFICATION_MODE = "none" as const;
export const DEFAULT_MAX_INTERACTION_AGE_MS = 60_000;

type BrowserLikeEventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function clampNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `wbv_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function createInteractionEventListener(
  tracker: BrowserVerificationTracker,
  kind: BrowserInteractionKind
): EventListener {
  return (event) => {
    tracker.recordInteraction(kind, {
      trusted: event.isTrusted === true,
    });
  };
}

export class BrowserVerificationTracker {
  private trusted_event_count = 0;
  private pointer_event_count = 0;
  private keyboard_event_count = 0;
  private touch_event_count = 0;
  private first_event_at_ms: number | null = null;
  private last_event_at_ms: number | null = null;

  recordInteraction(
    kind: BrowserInteractionKind,
    args: {
      trusted: boolean;
      at_ms?: number;
    }
  ): void {
    if (args.trusted !== true) {
      return;
    }
    const at_ms = clampNonNegativeInteger(args.at_ms ?? Date.now()) ?? Date.now();
    this.trusted_event_count += 1;
    if (kind === "pointer") this.pointer_event_count += 1;
    if (kind === "keyboard") this.keyboard_event_count += 1;
    if (kind === "touch") this.touch_event_count += 1;
    this.first_event_at_ms = this.first_event_at_ms ?? at_ms;
    this.last_event_at_ms = at_ms;
  }

  snapshot(mode: PublicHumanVerificationMode = DEFAULT_HUMAN_VERIFICATION_MODE): PublicHumanVerificationSignals {
    const page_visible =
      typeof globalThis.document?.visibilityState === "string" ? globalThis.document.visibilityState !== "hidden" : undefined;
    const page_focused = typeof globalThis.document?.hasFocus === "function" ? globalThis.document.hasFocus() : undefined;
    return {
      mode,
      trusted_event_count: this.trusted_event_count,
      pointer_event_count: this.pointer_event_count,
      keyboard_event_count: this.keyboard_event_count,
      touch_event_count: this.touch_event_count,
      ...(this.first_event_at_ms !== null ? { first_event_at_ms: this.first_event_at_ms } : {}),
      ...(this.last_event_at_ms !== null ? { last_event_at_ms: this.last_event_at_ms } : {}),
      ...(typeof page_visible === "boolean" ? { page_visible } : {}),
      ...(typeof page_focused === "boolean" ? { page_focused } : {}),
    };
  }
}

let globalTracker: BrowserVerificationTracker | null = null;
let globalTrackerAttached = false;

function ensureBrowserVerificationTracker(): BrowserVerificationTracker | null {
  if (globalTrackerAttached) {
    return globalTracker;
  }
  const documentTarget = globalThis.document as unknown as BrowserLikeEventTarget | undefined;
  if (
    !documentTarget ||
    typeof documentTarget.addEventListener !== "function" ||
    typeof documentTarget.removeEventListener !== "function"
  ) {
    return null;
  }
  globalTracker = new BrowserVerificationTracker();
  documentTarget.addEventListener("pointerdown", createInteractionEventListener(globalTracker, "pointer"), {
    passive: true,
  } as AddEventListenerOptions);
  documentTarget.addEventListener("keydown", createInteractionEventListener(globalTracker, "keyboard"), {
    passive: true,
  } as AddEventListenerOptions);
  documentTarget.addEventListener("touchstart", createInteractionEventListener(globalTracker, "touch"), {
    passive: true,
  } as AddEventListenerOptions);
  globalTrackerAttached = true;
  return globalTracker;
}

function readNavigatorRecord(): Record<string, unknown> | null {
  return isRecord(globalThis.navigator) ? (globalThis.navigator as unknown as Record<string, unknown>) : null;
}

export function collectBrowserDeviceSignals(): PublicBrowserDeviceSignals | undefined {
  const navigatorRecord = readNavigatorRecord();
  const screenRecord = isRecord(globalThis.screen) ? (globalThis.screen as unknown as Record<string, unknown>) : null;
  const viewport_width =
    clampNonNegativeInteger(globalThis.window?.innerWidth) ??
    clampNonNegativeInteger((globalThis as Record<string, unknown>)["innerWidth"]);
  const viewport_height =
    clampNonNegativeInteger(globalThis.window?.innerHeight) ??
    clampNonNegativeInteger((globalThis as Record<string, unknown>)["innerHeight"]);
  const screen_width = clampNonNegativeInteger(screenRecord?.["width"]);
  const screen_height = clampNonNegativeInteger(screenRecord?.["height"]);
  const pixel_ratio =
    typeof globalThis.window?.devicePixelRatio === "number" && Number.isFinite(globalThis.window.devicePixelRatio)
      ? globalThis.window.devicePixelRatio
      : typeof (globalThis as Record<string, unknown>)["devicePixelRatio"] === "number" &&
          Number.isFinite((globalThis as Record<string, unknown>)["devicePixelRatio"] as number)
        ? ((globalThis as Record<string, unknown>)["devicePixelRatio"] as number)
        : undefined;
  const color_depth = clampNonNegativeInteger(screenRecord?.["colorDepth"]);
  const platform = readString(navigatorRecord?.["platform"]);
  const language = readString(navigatorRecord?.["language"]);
  const timezone = readString(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const hardware_concurrency = clampNonNegativeInteger(navigatorRecord?.["hardwareConcurrency"]);
  const device_memory_gb =
    typeof navigatorRecord?.["deviceMemory"] === "number" && Number.isFinite(navigatorRecord["deviceMemory"])
      ? navigatorRecord["deviceMemory"]
      : undefined;
  const max_touch_points = clampNonNegativeInteger(navigatorRecord?.["maxTouchPoints"]);
  const webdriver = readBoolean(navigatorRecord?.["webdriver"]);
  const cookies_enabled = readBoolean(navigatorRecord?.["cookieEnabled"]);
  const do_not_track = readString(navigatorRecord?.["doNotTrack"]);

  const fingerprintSource = [
    platform ?? "",
    language ?? "",
    timezone ?? "",
    String(screen_width ?? ""),
    String(screen_height ?? ""),
    String(viewport_width ?? ""),
    String(viewport_height ?? ""),
    String(pixel_ratio ?? ""),
    String(color_depth ?? ""),
    String(hardware_concurrency ?? ""),
    String(device_memory_gb ?? ""),
    String(max_touch_points ?? ""),
  ].join("|");

  const fingerprint_hint = fingerprintSource.replace(/\|/g, "").length > 0 ? fnv1a(fingerprintSource) : undefined;
  const device: PublicBrowserDeviceSignals = {
    ...(fingerprint_hint ? { fingerprint_hint } : {}),
    ...(platform ? { platform } : {}),
    ...(language ? { language } : {}),
    ...(timezone ? { timezone } : {}),
    ...(viewport_width !== undefined ? { viewport_width } : {}),
    ...(viewport_height !== undefined ? { viewport_height } : {}),
    ...(screen_width !== undefined ? { screen_width } : {}),
    ...(screen_height !== undefined ? { screen_height } : {}),
    ...(pixel_ratio !== undefined ? { pixel_ratio } : {}),
    ...(color_depth !== undefined ? { color_depth } : {}),
    ...(hardware_concurrency !== undefined ? { hardware_concurrency } : {}),
    ...(device_memory_gb !== undefined ? { device_memory_gb } : {}),
    ...(max_touch_points !== undefined ? { max_touch_points } : {}),
    ...(webdriver !== undefined ? { webdriver } : {}),
    ...(cookies_enabled !== undefined ? { cookies_enabled } : {}),
    ...(do_not_track ? { do_not_track } : {}),
  };
  return Object.keys(device).length > 0 ? device : undefined;
}

export function collectBrowserVerification(
  config: BrowserHumanVerificationConfig = {}
): PublicVerificationSignals | undefined {
  const mode = config.mode ?? DEFAULT_HUMAN_VERIFICATION_MODE;
  const tracker = ensureBrowserVerificationTracker();
  const device = collectBrowserDeviceSignals();
  const human = tracker?.snapshot(mode);
  if (!device && !human) {
    return undefined;
  }
  return {
    ...(device ? { device } : {}),
    ...(human ? { human } : {}),
  };
}

export function evaluateHumanVerificationRequirement(args: {
  verification?: PublicVerificationSignals | null;
  mode?: PublicHumanVerificationMode;
  now_ms?: number;
  max_interaction_age_ms?: number;
}): { ok: true } | { ok: false; reason: "trusted_interaction_required" | "trusted_interaction_stale" } {
  const verification = args.verification ?? undefined;
  const mode = args.mode ?? verification?.human?.mode ?? DEFAULT_HUMAN_VERIFICATION_MODE;
  if (mode !== "interaction_required") {
    return { ok: true };
  }
  const trusted_event_count = verification?.human?.trusted_event_count ?? 0;
  if (trusted_event_count < 1) {
    return { ok: false, reason: "trusted_interaction_required" };
  }
  const last_event_at_ms = verification?.human?.last_event_at_ms;
  const max_interaction_age_ms = clampNonNegativeInteger(args.max_interaction_age_ms) ?? DEFAULT_MAX_INTERACTION_AGE_MS;
  const now_ms = clampNonNegativeInteger(args.now_ms) ?? Date.now();
  if (typeof last_event_at_ms === "number" && last_event_at_ms >= 0 && now_ms - last_event_at_ms > max_interaction_age_ms) {
    return { ok: false, reason: "trusted_interaction_stale" };
  }
  return { ok: true };
}
