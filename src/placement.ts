import type { DecisionResponse, WavebirdPlacement } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFormat(value: unknown): WavebirdPlacement["format"] | null {
  return value === "banner" || value === "clip" || value === "native" ? value : null;
}

function readRenderMediaType(value: unknown): NonNullable<WavebirdPlacement["render"]>["media_type"] | null {
  return value === "image" || value === "video" || value === "native" ? value : null;
}

function readNativeTemplateId(
  value: unknown
): NonNullable<WavebirdPlacement["render"]>["native_template_id"] | null {
  return value === "card" || value === "list_item" || value === "featured" || value === "minimal" ? value : null;
}

function readHostedRenderDescriptor(value: unknown): WavebirdPlacement["render"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const frameUrl = readString(value.frame_url);
  const scriptUrl = readString(value.script_url);
  const mediaType = readRenderMediaType(value.media_type);
  const width = readNumber(value.width);
  const height = readNumber(value.height);
  const aspectRatio = readString(value.aspect_ratio);
  const labelText = readString(value.label_text);
  const nativeTemplateId = readNativeTemplateId(value.native_template_id);
  if (
    value.strategy !== "hosted_frame" ||
    !frameUrl ||
    !scriptUrl ||
    !mediaType ||
    width === null ||
    height === null ||
    !aspectRatio ||
    !labelText
  ) {
    return undefined;
  }
  return {
    strategy: "hosted_frame",
    frame_url: frameUrl,
    script_url: scriptUrl,
    media_type: mediaType,
    width,
    height,
    aspect_ratio: aspectRatio,
    label_text: labelText,
    sponsor_name: typeof value.sponsor_name === "string" ? value.sponsor_name : null,
    click_url: typeof value.click_url === "string" ? value.click_url : null,
    ...(nativeTemplateId ? { native_template_id: nativeTemplateId } : {}),
  };
}

function fromPlacementRecord(value: unknown): WavebirdPlacement | null {
  if (!isRecord(value)) {
    return null;
  }
  const format = readFormat(value.format);
  const assetToken = readString(value.asset_token);
  if (!format || !assetToken) {
    return null;
  }
  const render = readHostedRenderDescriptor(value.render);
  return {
    image_url: typeof value.image_url === "string" ? value.image_url : null,
    ...(typeof value.video_url === "string" ? { video_url: value.video_url } : {}),
    click_url: typeof value.click_url === "string" ? value.click_url : null,
    sponsor_name: typeof value.sponsor_name === "string" ? value.sponsor_name : null,
    width: readNumber(value.width) ?? 0,
    height: readNumber(value.height) ?? 0,
    format,
    asset_token: assetToken,
    ad_label_text: readString(value.ad_label_text) ?? "Sponsored",
    ...(render ? { render } : {}),
  };
}

function fromCanonicalDecisionRecord(value: Record<string, unknown>): WavebirdPlacement | null {
  const placement = fromPlacementRecord(value.placement);
  if (placement) {
    return placement;
  }
  const decision = isRecord(value.decision) ? value.decision : null;
  if (!decision || decision.fill !== true) {
    return null;
  }
  const format = readFormat(decision.format);
  const assetToken = readString(decision.asset_token);
  if (!format || !assetToken) {
    return null;
  }
  const dimensions = isRecord(decision.dimensions) ? decision.dimensions : {};
  const nativeAssets = isRecord(decision.assets) ? decision.assets : null;
  const deliveryUrl = readString(decision.delivery_url);
  const nativeImageUrl = nativeAssets ? readString(nativeAssets.image_url) : null;
  return {
    image_url: format === "clip" ? null : nativeImageUrl ?? deliveryUrl,
    ...(format === "clip" && deliveryUrl ? { video_url: deliveryUrl } : {}),
    click_url: typeof decision.click_url === "string" ? decision.click_url : null,
    sponsor_name: typeof decision.sponsor_name === "string" ? decision.sponsor_name : null,
    width: readNumber(dimensions.width) ?? 0,
    height: readNumber(dimensions.height) ?? 0,
    format,
    asset_token: assetToken,
    ad_label_text: readString(decision.ad_label_text) ?? "Sponsored",
  };
}

function fromSdkDecision(value: DecisionResponse): WavebirdPlacement | null {
  if (value.fill !== true) {
    return null;
  }
  const format = readFormat(value.creative.type);
  if (!format) {
    return null;
  }
  return {
    image_url: format === "clip" ? null : value.creative.url,
    ...(format === "clip" ? { video_url: value.creative.url } : {}),
    click_url: value.creative.click_through_url ?? null,
    sponsor_name: value.creative.sponsor_name ?? null,
    width: typeof value.creative.width === "number" ? value.creative.width : 0,
    height: typeof value.creative.height === "number" ? value.creative.height : 0,
    format,
    asset_token: value.asset_token,
    ad_label_text: "Sponsored",
  };
}

/**
 * Normalize canonical `/v1/decisions/{slot_id}` responses and SDK
 * `DecisionResponse` objects into the same render-friendly placement shape.
 */
export function normalizeWavebirdPlacement(response: unknown): WavebirdPlacement | null {
  if (!isRecord(response)) {
    return null;
  }
  if ("placement" in response || "decision" in response) {
    return fromCanonicalDecisionRecord(response);
  }
  return fromSdkDecision(response as DecisionResponse);
}
