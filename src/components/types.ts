import type { PublicJurisdictionOverrides, PublicJurisdictionZone } from "../public_contracts.js";
import type { DecisionResponse } from "../types.js";
import type { ConsentDecision, ConsentPurposes } from "../consent/consent-store.js";
import type { BeaconRequest } from "../types.js";

export type BeaconSender = (request: BeaconRequest) => Promise<unknown>;

export type WavebirdFillDecision = Extract<DecisionResponse, { fill: true }>;

export type WavebirdCreative = WavebirdFillDecision["creative"];

export type NativeAsset = NonNullable<WavebirdCreative["native_assets"]>;

export type WavebirdNativeRenderProps = {
  asset: NativeAsset;
  assets: NativeAsset;
  creative: WavebirdCreative;
  decision: WavebirdFillDecision;
  sponsorName: string | null;
  sponsorLine: string | null;
  clickUrl: string | null;
  ctaText: string;
  imageAlt: string;
  labelText: string;
  openClick: () => void;
};

export type AdPosition = "above" | "below" | "inline";

export type AdWidgetCommonOptions = {
  decision: DecisionResponse | null;
  sendBeacon: BeaconSender;
  labelText?: string;
  label?: string;
  position?: AdPosition;
  onFill?: (creative: WavebirdCreative) => void;
  onNoFill?: () => void;
  onClick?: (url: string) => void;
  onError?: (err: Error) => void;
  showLabel?: boolean;
  openClickInNewTab?: boolean;
  disableConsentCollection?: boolean;
  consentString?: string | null;
  jurisdictionZone?: PublicJurisdictionZone;
  jurisdictionOverrides?: PublicJurisdictionOverrides;
  consentLocale?: string;
  consentPrimaryColor?: string;
  resolveDecisionWithConsent?: (payload: {
    consent_source: "wavebird_consent";
    purposes: ConsentPurposes;
    decision: ConsentDecision;
  }) => Promise<DecisionResponse | null>;
};

export type MountWavebirdAdOptions = AdWidgetCommonOptions & {
  target: HTMLElement | null;
  style?: Record<string, string>;
};
