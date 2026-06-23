"use client";

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { DecisionResponse } from "../types.js";
import { ConsentDialog } from "../consent/ConsentDialog.js";
import {
  getConsent,
  needsRefresh,
  requiresConsentCollection,
  setConsent,
  type ConsentDecision,
  type ConsentPurposes,
} from "../consent/index.js";
import {
  adStyles,
  buildContainerStyle,
  getClickThroughUrl,
  getClipCtaText,
  getDecisionStateKey,
  getImageAlt,
  hardenLabelElement,
  getLabelText,
  getNativeAssets,
  getNativeCtaText,
  getSponsorLine,
  getSponsorName,
  isFilledDecision,
  mergeInlineStyles,
  openClickThroughUrl,
  warnDeprecatedShowLabelOption,
} from "./ad-renderer.js";
import { fireTrackingPixels, startBeaconTracking, type BeaconSender } from "./beacon-tracker.js";
import type { AdPosition, AdWidgetCommonOptions, WavebirdNativeRenderProps } from "./types.js";

export type { NativeAsset, WavebirdNativeRenderProps } from "./types.js";

export interface WavebirdAdProps extends AdWidgetCommonOptions {
  className?: string;
  style?: CSSProperties;
  renderNative?: (props: WavebirdNativeRenderProps) => ReactNode;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === "string" ? error : "wavebird_click_failed");
}

function createClickBeaconSender(args: {
  assetToken: string;
  sendBeacon: BeaconSender;
  onError?: (err: Error) => void;
}) {
  return () => {
    const beaconId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    Promise.resolve(
      args.sendBeacon({
        beacon_id: beaconId,
        asset_token: args.assetToken,
        beacon_type: "clicked",
        occurred_at_ms_client: Date.now(),
      })
    ).catch((error) => {
      args.onError?.(normalizeError(error));
    });
  };
}

function WavebirdAdRenderer({
  decision,
  labelText,
  sendBeacon,
  label,
  position = "inline",
  className,
  style,
  onFill,
  onNoFill,
  onClick,
  onError,
  showLabel = true,
  openClickInNewTab = true,
  renderNative,
  jurisdictionZone,
  consentLocale,
}: {
  decision: DecisionResponse | null;
  sendBeacon: BeaconSender;
  labelText?: string;
  label?: string;
  position?: AdPosition;
  className?: string;
  style?: CSSProperties;
  onFill?: WavebirdAdProps["onFill"];
  onNoFill?: WavebirdAdProps["onNoFill"];
  onClick?: WavebirdAdProps["onClick"];
  onError?: WavebirdAdProps["onError"];
  showLabel?: boolean;
  openClickInNewTab?: boolean;
  renderNative?: WavebirdAdProps["renderNative"];
  jurisdictionZone?: WavebirdAdProps["jurisdictionZone"];
  consentLocale?: string;
}) {
  const mediaFrameRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastNoFillKeyRef = useRef<string | null>(null);
  const fillDecision = isFilledDecision(decision) ? decision : null;
  const fillKey = fillDecision ? getDecisionStateKey(fillDecision) : null;

  warnDeprecatedShowLabelOption(showLabel);

  useEffect(() => {
    if (fillDecision) {
      lastNoFillKeyRef.current = null;
      return;
    }
    const noFillKey = getDecisionStateKey(decision);
    if (lastNoFillKeyRef.current === noFillKey) {
      return;
    }
    lastNoFillKeyRef.current = noFillKey;
    onNoFill?.();
  }, [decision, fillDecision, onNoFill]);

  useEffect(() => {
    if (!fillDecision) {
      return;
    }
    onFill?.(fillDecision.creative);
  }, [fillKey, onFill]);

  useEffect(() => {
    if (!fillDecision || !fillKey || !mediaFrameRef.current) {
      return;
    }
    const trackedDecision = fillDecision;
    return startBeaconTracking({
      assetToken: trackedDecision.asset_token,
      creativeType: trackedDecision.creative.type,
      sendBeacon,
      element: mediaFrameRef.current,
      ...(trackedDecision.creative.type === "clip" && videoRef.current ? { videoElement: videoRef.current } : {}),
      ...(trackedDecision.creative.vast_tracking ? { vastTracking: trackedDecision.creative.vast_tracking } : {}),
      ...(onError ? { onError } : {}),
    });
  }, [fillKey, onError, sendBeacon]);

  useEffect(() => {
    if (!fillDecision) {
      return;
    }
    return hardenLabelElement(labelRef.current);
  }, [fillDecision, fillKey]);

  if (!fillDecision) {
    return null;
  }

  const clickUrl = getClickThroughUrl(fillDecision.creative);
  const nativeAssets = getNativeAssets(fillDecision.creative);
  const sponsorName = getSponsorName(fillDecision.creative);
  const sponsorLine = getSponsorLine(fillDecision.creative);
  const clickable = fillDecision.creative.type === "banner" && Boolean(clickUrl);
  const resolvedLabelText = getLabelText({
    labelText,
    label,
    jurisdiction: jurisdictionZone,
    locale: consentLocale,
  });
  const containerStyle = mergeInlineStyles(
    buildContainerStyle({
      creative: fillDecision.creative,
      position,
      clickable,
    })
  );
  const sendClickBeacon = createClickBeaconSender({
    assetToken: fillDecision.asset_token,
    sendBeacon,
    ...(onError ? { onError } : {}),
  });
  const vastClickTracking = fillDecision.creative.vast_tracking?.clickTracking ?? [];

  const handleClick = (url: string) => {
    fireTrackingPixels(vastClickTracking, onError);
    sendClickBeacon();
    onClick?.(url);
    openClickThroughUrl(url, openClickInNewTab);
  };

  const handleImageKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, url: string) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    handleClick(url);
  };
  const nativeRenderProps: WavebirdNativeRenderProps | null =
    fillDecision.creative.type === "native" && nativeAssets
      ? {
          asset: nativeAssets,
          assets: nativeAssets,
          creative: fillDecision.creative,
          decision: fillDecision,
          sponsorName,
          sponsorLine,
          clickUrl,
          ctaText: getNativeCtaText(fillDecision.creative),
          imageAlt: getImageAlt(fillDecision.creative),
          labelText: resolvedLabelText,
          openClick: () => {
            if (clickUrl) {
              handleClick(clickUrl);
            }
          },
        }
      : null;

  return (
    <div className={className} style={{ ...containerStyle, ...style } as CSSProperties}>
      <span ref={labelRef} style={adStyles.label as CSSProperties}>
        {resolvedLabelText}
      </span>
      <div ref={mediaFrameRef} style={adStyles.mediaFrame as CSSProperties}>
        {fillDecision.creative.type === "clip" ? (
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            src={fillDecision.creative.url}
            style={adStyles.video as CSSProperties}
          />
        ) : fillDecision.creative.type === "native" && nativeAssets ? (
          renderNative && nativeRenderProps ? (
            <>{renderNative(nativeRenderProps)}</>
          ) : (
            <div style={adStyles.nativeCard as CSSProperties}>
              <img
                alt={getImageAlt(fillDecision.creative)}
                loading="lazy"
                src={nativeAssets.image_url}
                style={adStyles.nativeImage as CSSProperties}
              />
              <div style={adStyles.nativeBody as CSSProperties}>
                <div style={adStyles.nativeHeader as CSSProperties}>
                  {nativeAssets.icon_url ? (
                    <img
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      src={nativeAssets.icon_url}
                      style={adStyles.nativeIcon as CSSProperties}
                    />
                  ) : null}
                  <div style={adStyles.nativeText as CSSProperties}>
                    <p style={adStyles.nativeTitle as CSSProperties}>{nativeAssets.title}</p>
                    {nativeAssets.description ? (
                      <p style={adStyles.nativeDescription as CSSProperties}>{nativeAssets.description}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )
        ) : clickUrl ? (
          <button
            type="button"
            onClick={() => handleClick(clickUrl)}
            onKeyDown={(event) => handleImageKeyDown(event, clickUrl)}
            style={adStyles.imageButton as CSSProperties}
          >
            <img
              alt={getImageAlt(fillDecision.creative)}
              loading="lazy"
              src={fillDecision.creative.url}
              style={adStyles.image as CSSProperties}
            />
          </button>
        ) : (
          <img
            alt={getImageAlt(fillDecision.creative)}
            loading="lazy"
            src={fillDecision.creative.url}
            style={adStyles.image as CSSProperties}
          />
        )}
      </div>
      {sponsorLine || ((fillDecision.creative.type === "clip" || fillDecision.creative.type === "native") && clickUrl) ? (
        <div style={adStyles.footer as CSSProperties}>
          <span style={adStyles.sponsorText as CSSProperties}>{sponsorLine ?? "Sponsored placement"}</span>
          {(fillDecision.creative.type === "clip" || fillDecision.creative.type === "native") && clickUrl ? (
            <button type="button" onClick={() => handleClick(clickUrl)} style={adStyles.ctaButton as CSSProperties}>
              {fillDecision.creative.type === "native"
                ? getNativeCtaText(fillDecision.creative)
                : getClipCtaText(fillDecision.creative)}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function WavebirdAd({
  decision,
  sendBeacon,
  labelText,
  label,
  position = "inline",
  className,
  style,
  onFill,
  onNoFill,
  onClick,
  onError,
  showLabel = true,
  openClickInNewTab = true,
  renderNative,
  disableConsentCollection,
  consentString,
  jurisdictionZone,
  jurisdictionOverrides,
  consentLocale,
  consentPrimaryColor,
  resolveDecisionWithConsent,
}: WavebirdAdProps) {
  const [effectiveDecision, setEffectiveDecision] = useState<DecisionResponse | null>(decision);
  const [storageReady, setStorageReady] = useState(false);
  const [holdConsentDialog, setHoldConsentDialog] = useState(false);
  const [consentConfigError, setConsentConfigError] = useState<string | null>(null);
  const callbackErrorSeenRef = useRef(false);
  const explicitConsentString =
    typeof consentString === "string" && consentString.trim().length > 0 ? consentString.trim() : null;
  const consentRequired = requiresConsentCollection(jurisdictionZone, jurisdictionOverrides);
  const builtInConsentFlowEnabled = !disableConsentCollection && !explicitConsentString && consentRequired;

  useEffect(() => {
    setEffectiveDecision(decision);
  }, [decision]);

  useEffect(() => {
    if (!builtInConsentFlowEnabled) {
      setStorageReady(true);
      setHoldConsentDialog(false);
      setConsentConfigError(null);
      callbackErrorSeenRef.current = false;
      return;
    }
    const storedConsent = getConsent();
    setHoldConsentDialog(needsRefresh(storedConsent));
    setConsentConfigError(resolveDecisionWithConsent ? null : "wavebird_consent_retry_not_configured");
    setStorageReady(true);
  }, [builtInConsentFlowEnabled, resolveDecisionWithConsent]);

  useEffect(() => {
    if (!builtInConsentFlowEnabled || !storageReady || !holdConsentDialog || resolveDecisionWithConsent || callbackErrorSeenRef.current) {
      return;
    }
    callbackErrorSeenRef.current = true;
    onError?.(new Error("wavebird_consent_retry_not_configured"));
  }, [builtInConsentFlowEnabled, holdConsentDialog, onError, resolveDecisionWithConsent, storageReady]);

  if (builtInConsentFlowEnabled && !storageReady) {
    return null;
  }

  if (builtInConsentFlowEnabled && holdConsentDialog) {
    return (
      <ConsentDialog
        {...(consentLocale !== undefined ? { locale: consentLocale } : {})}
        {...(consentPrimaryColor !== undefined ? { primaryColor: consentPrimaryColor } : {})}
        {...(consentConfigError !== null ? { error: consentConfigError } : {})}
        onDecision={async ({ decision: nextDecision, purposes }: { decision: ConsentDecision; purposes: ConsentPurposes }) => {
          const savedConsent = setConsent(nextDecision, {
            purposes,
            jurisdiction: jurisdictionZone ?? "rest_of_world",
          });
          if (!resolveDecisionWithConsent) {
            throw new Error("wavebird_consent_retry_not_configured");
          }
          try {
            const retriedDecision = await resolveDecisionWithConsent({
              consent_source: "wavebird_consent",
              purposes: savedConsent.purposes,
              decision: nextDecision,
            });
            setEffectiveDecision(retriedDecision);
            setHoldConsentDialog(false);
            setConsentConfigError(null);
          } catch (error) {
            const normalizedError = normalizeError(error);
            onError?.(normalizedError);
            throw normalizedError;
          }
        }}
      />
    );
  }

  return (
    <WavebirdAdRenderer
      decision={effectiveDecision}
      sendBeacon={sendBeacon}
      {...(labelText !== undefined ? { labelText } : {})}
      {...(label !== undefined ? { label } : {})}
      {...(position !== undefined ? { position } : {})}
      {...(className !== undefined ? { className } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(onFill !== undefined ? { onFill } : {})}
      {...(onNoFill !== undefined ? { onNoFill } : {})}
      {...(onClick !== undefined ? { onClick } : {})}
      {...(onError !== undefined ? { onError } : {})}
      {...(showLabel !== undefined ? { showLabel } : {})}
      {...(openClickInNewTab !== undefined ? { openClickInNewTab } : {})}
      {...(renderNative !== undefined ? { renderNative } : {})}
      {...(jurisdictionZone !== undefined ? { jurisdictionZone } : {})}
      {...(consentLocale !== undefined ? { consentLocale } : {})}
    />
  );
}
