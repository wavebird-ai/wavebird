import type { PublicJurisdictionZone } from "../public_contracts.js";
import type { DecisionResponse } from "../types.js";
import type { AdPosition, WavebirdCreative, WavebirdFillDecision } from "./types.js";

export type InlineStyleRecord = Record<string, string | undefined>;

const EU_STRICT_ALLOWED_LABELS = new Set([
  "Anzeige",
  "Sponsored",
  "Werbung",
  "Advertisement",
  "Publicité",
  "Publicidad",
  "Publicidade",
  "Pubblicità",
  "Advertentie",
  "広告",
  "광고",
  "Ad",
]);

const DEPRECATED_SHOW_LABEL_WARNING =
  "showLabel: false is no longer supported. Ad labels are always required. Use labelText to customize the label.";
const EMITTED_LABEL_WARNINGS = new Set<string>();
const LABEL_GUARD_ATTRIBUTE_FILTER = ["style", "class", "hidden", "aria-hidden"] as const;

type StyleDeclarationLike = {
  setProperty?: (property: string, value: string, priority?: string) => void;
} & Record<string, string | undefined>;

function warnOnce(key: string, message: string): void {
  if (typeof console?.warn !== "function" || EMITTED_LABEL_WARNINGS.has(key)) {
    return;
  }
  EMITTED_LABEL_WARNINGS.add(key);
  console.warn(message);
}

export const positionStyles: Record<AdPosition, InlineStyleRecord> = {
  above: {
    marginBottom: "12px",
  },
  below: {
    marginTop: "12px",
  },
  inline: {},
};

export const adStyles = {
  container: {
    position: "relative",
    display: "inline-flex",
    flexDirection: "column",
    gap: "8px",
    overflow: "hidden",
    boxSizing: "border-box",
    borderRadius: "8px",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "#ffffff",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
    maxWidth: "100%",
  } satisfies InlineStyleRecord,
  mediaFrame: {
    position: "relative",
    display: "block",
    overflow: "hidden",
    background: "#0f172a",
  } satisfies InlineStyleRecord,
  imageButton: {
    display: "block",
    width: "100%",
    padding: "0",
    border: "0",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  } satisfies InlineStyleRecord,
  image: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    height: "auto",
  } satisfies InlineStyleRecord,
  video: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    background: "#000000",
  } satisfies InlineStyleRecord,
  label: {
    display: "inline-flex",
    alignSelf: "flex-start",
    position: "relative",
    visibility: "visible",
    opacity: "1",
    margin: "8px 8px 0",
    background: "var(--wavebird-ad-label-bg, rgba(15, 23, 42, 0.92))",
    color: "var(--wavebird-ad-label-color, #ffffff)",
    fontSize: "11px",
    fontWeight: "600",
    lineHeight: "1.2",
    padding: "2px 6px",
    borderRadius: "999px",
    letterSpacing: "0.02em",
    pointerEvents: "none",
    zIndex: "1",
    maxWidth: "calc(100% - 16px)",
  } satisfies InlineStyleRecord,
  footer: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "0 10px 10px",
    color: "#0f172a",
    fontSize: "12px",
    lineHeight: "1.4",
  } satisfies InlineStyleRecord,
  sponsorText: {
    color: "#334155",
    flex: "1 1 auto",
    minWidth: "0",
  } satisfies InlineStyleRecord,
  ctaButton: {
    border: "0",
    borderRadius: "999px",
    background: "#0f172a",
    color: "#ffffff",
    cursor: "pointer",
    padding: "6px 10px",
    fontSize: "12px",
    whiteSpace: "nowrap",
  } satisfies InlineStyleRecord,
  nativeCard: {
    display: "flex",
    flexDirection: "column",
    background: "#ffffff",
  } satisfies InlineStyleRecord,
  nativeImage: {
    display: "block",
    width: "100%",
    maxWidth: "100%",
    aspectRatio: "6 / 5",
    objectFit: "cover",
    background: "#e2e8f0",
  } satisfies InlineStyleRecord,
  nativeBody: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "12px",
    color: "#0f172a",
    background: "#ffffff",
  } satisfies InlineStyleRecord,
  nativeHeader: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
  } satisfies InlineStyleRecord,
  nativeIcon: {
    width: "40px",
    height: "40px",
    borderRadius: "10px",
    flex: "0 0 auto",
    objectFit: "cover",
    background: "#e2e8f0",
  } satisfies InlineStyleRecord,
  nativeText: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: "0",
  } satisfies InlineStyleRecord,
  nativeTitle: {
    margin: "0",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "1.3",
    color: "#0f172a",
  } satisfies InlineStyleRecord,
  nativeDescription: {
    margin: "0",
    fontSize: "13px",
    lineHeight: "1.5",
    color: "#475569",
  } satisfies InlineStyleRecord,
} as const;

const protectedLabelStyles: InlineStyleRecord = {
  display: "inline-flex",
  alignSelf: "flex-start",
  position: "relative",
  visibility: "visible",
  opacity: "1",
  margin: "8px 8px 0",
  background: "var(--wavebird-ad-label-bg, rgba(15, 23, 42, 0.92))",
  color: "var(--wavebird-ad-label-color, #ffffff)",
  fontSize: "11px",
  fontWeight: "600",
  lineHeight: "1.2",
  padding: "2px 6px",
  borderRadius: "999px",
  letterSpacing: "0.02em",
  pointerEvents: "none",
  zIndex: "1",
  maxWidth: "calc(100% - 16px)",
};

function toCssPropertyName(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function setInlineStyleValue(style: StyleDeclarationLike, property: string, value: string, important = false): void {
  if (typeof style.setProperty === "function") {
    style.setProperty(toCssPropertyName(property), value, important ? "important" : "");
    return;
  }
  style[property] = value;
}

function readAttributeValue(element: HTMLElement, name: string): string | null {
  if (typeof element.getAttribute === "function") {
    return element.getAttribute(name);
  }
  const maybeAttributes = element as HTMLElement & {
    attributes?: Record<string, string | undefined>;
  };
  if (maybeAttributes.attributes && typeof maybeAttributes.attributes === "object") {
    return maybeAttributes.attributes[name] ?? null;
  }
  return null;
}

function removeAttributeValue(element: HTMLElement, name: string): void {
  if (typeof element.removeAttribute === "function") {
    element.removeAttribute(name);
    return;
  }
  const maybeAttributes = element as HTMLElement & {
    attributes?: Record<string, string | undefined>;
  };
  if (maybeAttributes.attributes && typeof maybeAttributes.attributes === "object") {
    delete maybeAttributes.attributes[name];
  }
}

function ensureVisibleLabelAttributes(element: HTMLElement): void {
  const hiddenElement = element as HTMLElement & { hidden?: boolean };
  if ("hidden" in hiddenElement) {
    hiddenElement.hidden = false;
  }
  removeAttributeValue(element, "hidden");
  if (readAttributeValue(element, "aria-hidden") === "true") {
    element.setAttribute("aria-hidden", "false");
  }
}

function getLabelWarningMessage(label: string, jurisdiction: string, fallback: string): string {
  return `Invalid ad label ${JSON.stringify(label)} for jurisdiction "${jurisdiction}". Falling back to ${JSON.stringify(fallback)}.`;
}

export function isFilledDecision(decision: DecisionResponse | null): decision is WavebirdFillDecision {
  return decision !== null && decision.status === "ready" && decision.fill === true;
}

export function getDecisionStateKey(decision: DecisionResponse | null): string {
  if (!decision) {
    return "null";
  }
  if (decision.status === "pending") {
    return `pending:${decision.slot_id}`;
  }
  if (decision.fill === false) {
    return `nofill:${decision.slot_id}:${decision.reason}`;
  }
  if (decision.fill === true) {
    return `fill:${decision.slot_id}:${decision.asset_token}`;
  }
  return "ready:unknown";
}

export function warnDeprecatedShowLabelOption(showLabel?: boolean): void {
  if (showLabel === false) {
    warnOnce("showLabel:false", DEPRECATED_SHOW_LABEL_WARNING);
  }
}

export function resolveLabelLocale(locale?: string): string {
  const browserLocale =
    typeof globalThis.navigator?.language === "string" ? globalThis.navigator.language.trim() : "";
  if (browserLocale.length > 0) {
    return browserLocale;
  }
  const fallbackLocale = typeof locale === "string" ? locale.trim() : "";
  return fallbackLocale.length > 0 ? fallbackLocale : "en";
}

export function getDefaultLabel(jurisdiction: string, locale: string): string {
  const normalizedLocale = locale.trim().toLowerCase();
  const isStrict = jurisdiction === "eu_strict" || jurisdiction === "br_lgpd";

  if (normalizedLocale.startsWith("de")) return isStrict ? "Anzeige" : "Sponsored";
  if (normalizedLocale.startsWith("fr")) return "Publicité";
  if (normalizedLocale.startsWith("es")) return "Publicidad";
  if (normalizedLocale.startsWith("pt")) return "Publicidade";
  if (normalizedLocale.startsWith("it")) return "Pubblicità";
  if (normalizedLocale.startsWith("nl")) return "Advertentie";
  if (normalizedLocale.startsWith("ja")) return "広告";
  if (normalizedLocale.startsWith("ko")) return "광고";
  return isStrict ? "Sponsored" : "Ad";
}

function getProvidedLabel(args: { labelText?: string | undefined; label?: string | undefined }): string | undefined {
  if (typeof args.labelText === "string") {
    return args.labelText;
  }
  if (typeof args.label === "string") {
    return args.label;
  }
  return undefined;
}

export function getLabelText(args: {
  labelText?: string | undefined;
  label?: string | undefined;
  jurisdiction?: PublicJurisdictionZone | undefined;
  locale?: string | undefined;
}): string {
  const jurisdiction = args.jurisdiction ?? "rest_of_world";
  const locale = resolveLabelLocale(args.locale);
  const fallback = getDefaultLabel(jurisdiction, locale);
  const providedLabel = getProvidedLabel(args);

  if (typeof providedLabel !== "string") {
    return fallback;
  }

  const trimmedLabel = providedLabel.trim();
  if (trimmedLabel.length < 2) {
    warnOnce(
      `invalid-label:${jurisdiction}:${trimmedLabel}:${fallback}`,
      getLabelWarningMessage(trimmedLabel, jurisdiction, fallback)
    );
    return fallback;
  }
  if (jurisdiction === "eu_strict" && !EU_STRICT_ALLOWED_LABELS.has(trimmedLabel)) {
    warnOnce(
      `invalid-label:${jurisdiction}:${trimmedLabel}:${fallback}`,
      getLabelWarningMessage(trimmedLabel, jurisdiction, fallback)
    );
    return fallback;
  }
  return trimmedLabel;
}

export function getClickThroughUrl(creative: WavebirdCreative): string | null {
  return typeof creative.click_through_url === "string" && creative.click_through_url.trim().length > 0
    ? creative.click_through_url.trim()
    : null;
}

export function getSponsorName(creative: WavebirdCreative): string | null {
  return typeof creative.sponsor_name === "string" && creative.sponsor_name.trim().length > 0
    ? creative.sponsor_name.trim()
    : null;
}

export function getSponsorLine(creative: WavebirdCreative): string | null {
  const sponsorName = getSponsorName(creative);
  return sponsorName ? `Sponsored by ${sponsorName}` : null;
}

export function getNativeAssets(creative: WavebirdCreative): WavebirdCreative["native_assets"] | null {
  return creative.type === "native" && creative.native_assets ? creative.native_assets : null;
}

export function getClipCtaText(creative: WavebirdCreative): string {
  const sponsorName = getSponsorName(creative);
  return sponsorName ? `Visit ${sponsorName}` : "Visit sponsor";
}

export function getNativeCtaText(creative: WavebirdCreative): string {
  const nativeAssets = getNativeAssets(creative);
  if (nativeAssets?.cta_text) {
    return nativeAssets.cta_text;
  }
  return getClipCtaText(creative);
}

export function getImageAlt(creative: WavebirdCreative): string {
  const nativeAssets = getNativeAssets(creative);
  if (nativeAssets?.title) {
    return nativeAssets.title;
  }
  const sponsorName = getSponsorName(creative);
  return sponsorName ? `Sponsored ad from ${sponsorName}` : "Sponsored ad";
}

export function mergeInlineStyles(...styles: Array<InlineStyleRecord | undefined>): InlineStyleRecord {
  return Object.assign({}, ...styles);
}

export function buildContainerStyle(args: {
  creative: WavebirdCreative;
  position: AdPosition;
  clickable: boolean;
}): InlineStyleRecord {
  // Let the widget shrink inside narrow placements without stretching past the creative's intended width.
  return mergeInlineStyles(adStyles.container, positionStyles[args.position], {
    width: "100%",
    maxWidth: `${args.creative.width}px`,
    cursor: args.clickable ? "pointer" : "default",
  });
}

export function applyInlineStyles(
  element: HTMLElement,
  ...styles: Array<InlineStyleRecord | Record<string, string> | undefined>
): void {
  for (const styleSet of styles) {
    if (!styleSet) {
      continue;
    }
    for (const [key, value] of Object.entries(styleSet)) {
      if (value === undefined) {
        continue;
      }
      setInlineStyleValue(element.style as unknown as StyleDeclarationLike, key, value);
    }
  }
}

export function applyProtectedInlineStyles(element: HTMLElement, styles: InlineStyleRecord): void {
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined) {
      continue;
    }
    setInlineStyleValue(element.style as unknown as StyleDeclarationLike, key, value, true);
  }
}

export function hardenLabelElement(element: HTMLElement | null): () => void {
  if (!element) {
    return () => {};
  }

  let observer: MutationObserver | null = null;
  const observe = () => {
    if (!observer) {
      return;
    }
    observer.observe(element, {
      attributes: true,
      attributeFilter: [...LABEL_GUARD_ATTRIBUTE_FILTER],
    });
  };
  const enforce = () => {
    observer?.disconnect();
    ensureVisibleLabelAttributes(element);
    applyProtectedInlineStyles(element, protectedLabelStyles);
    observe();
  };

  enforce();
  if (typeof MutationObserver !== "function") {
    return () => {};
  }

  observer = new MutationObserver(() => {
    enforce();
  });
  observe();

  return () => {
    observer?.disconnect();
  };
}

export function openClickThroughUrl(url: string, openClickInNewTab: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  if (openClickInNewTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.assign(url);
}
