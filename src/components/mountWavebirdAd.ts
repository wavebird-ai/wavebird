import {
  adStyles,
  applyInlineStyles,
  buildContainerStyle,
  getClickThroughUrl,
  getClipCtaText,
  getImageAlt,
  hardenLabelElement,
  getLabelText,
  getNativeAssets,
  getNativeCtaText,
  getSponsorLine,
  isFilledDecision,
  openClickThroughUrl,
  warnDeprecatedShowLabelOption,
} from "./ad-renderer.js";
import { fireTrackingPixels, startBeaconTracking } from "./beacon-tracker.js";
import {
  getConsent,
  needsRefresh,
  requiresConsentCollection,
  setConsent,
} from "../consent/index.js";
import { mountConsentDialog } from "../consent/mountConsentDialog.js";
import { warnSdkDeprecation } from "../deprecation.js";
import type { MountWavebirdAdOptions } from "./types.js";

function warnMountDeprecation(): void {
  warnSdkDeprecation(
    "mountWavebirdAd",
    "mountWavebirdAd is deprecated. Prefer the Wavebird Script Tag for browser rendering; this helper remains for legacy compatibility."
  );
}

warnMountDeprecation();

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === "string" ? error : "wavebird_click_failed");
}

function createClickBeaconSender(options: MountWavebirdAdOptions, assetToken: string) {
  return () => {
    const beaconId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    Promise.resolve(
      options.sendBeacon({
        beacon_id: beaconId,
        asset_token: assetToken,
        beacon_type: "clicked",
        occurred_at_ms_client: Date.now(),
      })
    ).catch((error) => {
      options.onError?.(normalizeError(error));
    });
  };
}

function mountRenderedWavebirdAd(options: MountWavebirdAdOptions): () => void {
  if (!(options.target instanceof HTMLElement)) {
    throw new Error("mountWavebirdAd target must be an HTMLElement");
  }

  warnDeprecatedShowLabelOption(options.showLabel);
  const target = options.target;
  target.replaceChildren();

  const fillDecision = isFilledDecision(options.decision) ? options.decision : null;
  if (!fillDecision) {
    options.onNoFill?.();
    return () => {
      target.replaceChildren();
    };
  }

  const clickUrl = getClickThroughUrl(fillDecision.creative);
  const nativeAssets = getNativeAssets(fillDecision.creative);
  const sponsorLine = getSponsorLine(fillDecision.creative);
  const clickable = fillDecision.creative.type === "banner" && Boolean(clickUrl);
  const root = document.createElement("div");
  applyInlineStyles(
    root,
    buildContainerStyle({
      creative: fillDecision.creative,
      position: options.position ?? "inline",
      clickable,
    }),
    options.style
  );

  const label = document.createElement("span");
  label.textContent = getLabelText({
    labelText: options.labelText,
    label: options.label,
    jurisdiction: options.jurisdictionZone,
    locale: options.consentLocale,
  });
  applyInlineStyles(label, adStyles.label);
  root.appendChild(label);
  const stopProtectingLabel = hardenLabelElement(label);

  const mediaFrame = document.createElement("div");
  applyInlineStyles(mediaFrame, adStyles.mediaFrame);
  root.appendChild(mediaFrame);

  const sendClickBeacon = createClickBeaconSender(options, fillDecision.asset_token);
  const detachListeners: Array<() => void> = [];
  const vastClickTracking = fillDecision.creative.vast_tracking?.clickTracking ?? [];
  const handleClick = (url: string) => {
    fireTrackingPixels(vastClickTracking, options.onError);
    sendClickBeacon();
    options.onClick?.(url);
    openClickThroughUrl(url, options.openClickInNewTab ?? true);
  };

  let videoElement: HTMLVideoElement | undefined;
  if (fillDecision.creative.type === "clip") {
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = fillDecision.creative.url;
    applyInlineStyles(video, adStyles.video);
    mediaFrame.appendChild(video);
    videoElement = video;
  } else if (fillDecision.creative.type === "native" && nativeAssets) {
    const nativeCard = document.createElement("div");
    applyInlineStyles(nativeCard, adStyles.nativeCard);

    const image = document.createElement("img");
    image.alt = getImageAlt(fillDecision.creative);
    image.loading = "lazy";
    image.src = nativeAssets.image_url;
    applyInlineStyles(image, adStyles.nativeImage);
    nativeCard.appendChild(image);

    const body = document.createElement("div");
    applyInlineStyles(body, adStyles.nativeBody);
    const header = document.createElement("div");
    applyInlineStyles(header, adStyles.nativeHeader);
    if (nativeAssets.icon_url) {
      const icon = document.createElement("img");
      icon.alt = "";
      icon.setAttribute("aria-hidden", "true");
      icon.loading = "lazy";
      icon.src = nativeAssets.icon_url;
      applyInlineStyles(icon, adStyles.nativeIcon);
      header.appendChild(icon);
    }
    const text = document.createElement("div");
    applyInlineStyles(text, adStyles.nativeText);
    const title = document.createElement("p");
    title.textContent = nativeAssets.title;
    applyInlineStyles(title, adStyles.nativeTitle);
    text.appendChild(title);
    if (nativeAssets.description) {
      const description = document.createElement("p");
      description.textContent = nativeAssets.description;
      applyInlineStyles(description, adStyles.nativeDescription);
      text.appendChild(description);
    }
    header.appendChild(text);
    body.appendChild(header);
    nativeCard.appendChild(body);
    mediaFrame.appendChild(nativeCard);
  } else if (clickUrl) {
    const button = document.createElement("button");
    button.type = "button";
    applyInlineStyles(button, adStyles.imageButton);
    const image = document.createElement("img");
    image.alt = getImageAlt(fillDecision.creative);
    image.loading = "lazy";
    image.src = fillDecision.creative.url;
    applyInlineStyles(image, adStyles.image);
    button.appendChild(image);
    const handleImageClick = () => handleClick(clickUrl);
    button.addEventListener("click", handleImageClick);
    detachListeners.push(() => button.removeEventListener("click", handleImageClick));
    mediaFrame.appendChild(button);
  } else {
    const image = document.createElement("img");
    image.alt = getImageAlt(fillDecision.creative);
    image.loading = "lazy";
    image.src = fillDecision.creative.url;
    applyInlineStyles(image, adStyles.image);
    mediaFrame.appendChild(image);
  }

  if (sponsorLine || ((fillDecision.creative.type === "clip" || fillDecision.creative.type === "native") && clickUrl)) {
    const footer = document.createElement("div");
    applyInlineStyles(footer, adStyles.footer);

    const sponsorText = document.createElement("span");
    sponsorText.textContent = sponsorLine ?? "Sponsored placement";
    applyInlineStyles(sponsorText, adStyles.sponsorText);
    footer.appendChild(sponsorText);

    if ((fillDecision.creative.type === "clip" || fillDecision.creative.type === "native") && clickUrl) {
      const cta = document.createElement("button");
      cta.type = "button";
      cta.textContent =
        fillDecision.creative.type === "native"
          ? getNativeCtaText(fillDecision.creative)
          : getClipCtaText(fillDecision.creative);
      applyInlineStyles(cta, adStyles.ctaButton);
      const handleCtaClick = () => handleClick(clickUrl);
      cta.addEventListener("click", handleCtaClick);
      detachListeners.push(() => cta.removeEventListener("click", handleCtaClick));
      footer.appendChild(cta);
    }

    root.appendChild(footer);
  }

  target.replaceChildren(root);
  options.onFill?.(fillDecision.creative);

  const stopBeaconTracking = startBeaconTracking({
    assetToken: fillDecision.asset_token,
    creativeType: fillDecision.creative.type,
    sendBeacon: options.sendBeacon,
    element: mediaFrame,
    ...(videoElement ? { videoElement } : {}),
    ...(fillDecision.creative.vast_tracking ? { vastTracking: fillDecision.creative.vast_tracking } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
  });

  return () => {
    stopProtectingLabel();
    stopBeaconTracking();
    for (const detach of detachListeners) {
      detach();
    }
    target.replaceChildren();
  };
}

/**
 * @deprecated Prefer the Wavebird Script Tag for browser rendering. This helper remains for legacy compatibility only.
 */
export function mountWavebirdAd(options: MountWavebirdAdOptions): () => void {
  warnMountDeprecation();
  if (!(options.target instanceof HTMLElement)) {
    throw new Error("mountWavebirdAd target must be an HTMLElement");
  }

  const target = options.target;
  const explicitConsentString =
    typeof options.consentString === "string" && options.consentString.trim().length > 0
      ? options.consentString.trim()
      : null;
  const consentRequired = requiresConsentCollection(options.jurisdictionZone, options.jurisdictionOverrides);
  const builtInConsentFlowEnabled = !options.disableConsentCollection && !explicitConsentString && consentRequired;
  let cleanup = () => {
    target.replaceChildren();
  };
  let disposed = false;

  const renderDecision = (decision: MountWavebirdAdOptions["decision"]) => {
    if (disposed) {
      return;
    }
    cleanup();
    cleanup = mountRenderedWavebirdAd({
      ...options,
      decision,
      target,
    });
  };

  const renderConsentDialog = () => {
    if (disposed) {
      return;
    }
    const consentRetryMissing = !options.resolveDecisionWithConsent;
    if (consentRetryMissing) {
      options.onError?.(new Error("wavebird_consent_retry_not_configured"));
    }
    cleanup();
    cleanup = mountConsentDialog({
      target,
      ...(options.consentLocale !== undefined ? { locale: options.consentLocale } : {}),
      ...(options.consentPrimaryColor !== undefined ? { primaryColor: options.consentPrimaryColor } : {}),
      ...(consentRetryMissing ? { error: "wavebird_consent_retry_not_configured" } : {}),
      onDecision: async ({ decision, purposes }) => {
        const savedConsent = setConsent(decision, {
          purposes,
          jurisdiction: options.jurisdictionZone ?? "rest_of_world",
        });
        if (!options.resolveDecisionWithConsent) {
          throw new Error("wavebird_consent_retry_not_configured");
        }
        try {
          const retriedDecision = await options.resolveDecisionWithConsent({
            consent_source: "wavebird_consent",
            purposes: savedConsent.purposes,
            decision,
          });
          renderDecision(retriedDecision);
        } catch (error) {
          const normalizedError = normalizeError(error);
          options.onError?.(normalizedError);
          throw normalizedError;
        }
      },
    });
  };

  if (builtInConsentFlowEnabled && needsRefresh(getConsent())) {
    renderConsentDialog();
  } else {
    renderDecision(options.decision);
  }

  return () => {
    disposed = true;
    cleanup();
    target.replaceChildren();
  };
}
