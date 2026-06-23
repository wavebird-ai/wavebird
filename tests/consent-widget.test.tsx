import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConsentDialog } from "../src/consent/ConsentDialog.js";
import { mountWavebirdAd } from "../src/components/mountWavebirdAd.js";
import { clearConsent, getConsent } from "../src/consent/consent-store.js";
import type { DecisionResponse } from "../src/types.js";

type Listener = (...args: unknown[]) => void;

class FakeStorage {
  private readonly entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.entries.has(key) ? this.entries.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }
}

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  style: Record<string, string> = {};
  textContent = "";
  attributes: Record<string, string> = {};
  parentNode: FakeElement | null = null;
  eventListeners = new Map<string, Set<Listener>>();

  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: FakeElement): FakeElement {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [];
    for (const child of children) {
      this.appendChild(child);
    }
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.eventListeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.eventListeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

function collectText(node: FakeElement): string {
  return [node.textContent, ...node.children.map((child) => collectText(child))].join(" ").trim();
}

function findElements(node: FakeElement, predicate: (entry: FakeElement) => boolean): FakeElement[] {
  const matches = predicate(node) ? [node] : [];
  for (const child of node.children) {
    matches.push(...findElements(child, predicate));
  }
  return matches;
}

function click(node: FakeElement): void {
  for (const listener of node.eventListeners.get("click") ?? []) {
    listener();
  }
}

function change(node: FakeElement): void {
  for (const listener of node.eventListeners.get("change") ?? []) {
    listener();
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const filledDecision: Extract<DecisionResponse, { fill: true }> = {
  slot_id: "slot_native_1",
  status: "ready",
  fill: true,
  creative: {
    url: "https://cdn.example.com/native-main.png",
    type: "native",
    duration_ms: 3_000,
    width: 300,
    height: 250,
    mime_type: "image/png",
    click_through_url: "https://example.com/landing",
    sponsor_name: "Example Sponsor",
    native_assets: {
      title: "Explore weekend travel deals",
      image_url: "https://cdn.example.com/native-main.png",
      description: "Save on hand-picked city breaks.",
      cta_text: "Book now",
      icon_url: "https://cdn.example.com/native-icon.png",
    },
  },
  asset_token: "asset_native_1",
  constraints: {
    mode: "native",
    require_viewability_ms: 1_000,
  },
  cs_declaration: "CS-S (S1/P0)*",
  revenue_estimate: {
    gross_cpm: 9.5,
    estimated_net_per_impression: 0.0076,
    currency: "EUR",
  },
};

const reactMarkup = renderToStaticMarkup(
  React.createElement(ConsentDialog, {
    locale: "de-DE",
    primaryColor: "#0f766e",
    onDecision: async () => {},
  })
);
assert.match(reactMarkup, /Damit diese App relevante Werbung zeigen kann/);
assert.match(reactMarkup, /Personalisierte Werbung akzeptieren/);
assert.doesNotMatch(reactMarkup, /role="dialog"/);

const originalHTMLElement = globalThis.HTMLElement;
const originalDocument = globalThis.document;
const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalLocalStorage = globalThis.localStorage;

Object.assign(globalThis, {
  HTMLElement: FakeElement,
  document: {
    createElement: (tagName: string) => new FakeElement(tagName),
  },
  IntersectionObserver: undefined,
  localStorage: new FakeStorage(),
});

try {
  clearConsent();
  const target = new FakeElement("div");
  const retriedPayloads: Array<Record<string, unknown>> = [];
  const beaconTypes: string[] = [];

  mountWavebirdAd({
    target: target as unknown as HTMLElement,
    decision: filledDecision,
    sendBeacon: async (request) => {
      beaconTypes.push(request.beacon_type);
      return { accepted: true, reason_code: "OK" };
    },
    jurisdictionZone: "eu_strict",
    resolveDecisionWithConsent: async (payload) => {
      retriedPayloads.push(payload as unknown as Record<string, unknown>);
      return filledDecision;
    },
  });

  assert.match(collectText(target), /wavebird/i);
  assert.deepEqual(beaconTypes, []);
  const buttons = findElements(target, (entry) => entry.tagName === "BUTTON");
  assert.equal(buttons.length >= 2, true);
  click(buttons[0]!);
  await flush();

  assert.deepEqual(beaconTypes, ["rendered"]);
  assert.equal(retriedPayloads.length, 1);
  assert.equal(retriedPayloads[0]?.consent_source, "wavebird_consent");
  assert.equal(retriedPayloads[0]?.decision, "accept_all");
  assert.equal(Object.prototype.hasOwnProperty.call(retriedPayloads[0]!, "tcf_consent_string"), false);
  assert.equal(getConsent()?.decision, "accept_all");
  assert.match(collectText(target), /Explore weekend travel deals/);

  clearConsent();
  const customTarget = new FakeElement("div");
  const customPayloads: Array<Record<string, unknown>> = [];
  mountWavebirdAd({
    target: customTarget as unknown as HTMLElement,
    decision: filledDecision,
    sendBeacon: async () => ({ accepted: true, reason_code: "OK" }),
    jurisdictionZone: "br_lgpd",
    resolveDecisionWithConsent: async (payload) => {
      customPayloads.push(payload as unknown as Record<string, unknown>);
      return filledDecision;
    },
  });
  const customButtons = findElements(customTarget, (entry) => entry.tagName === "BUTTON");
  click(customButtons[2]!);
  const inputs = findElements(customTarget, (entry) => entry.tagName === "INPUT");
  (inputs[2] as unknown as { checked: boolean }).checked = false;
  change(inputs[2]!);
  const saveButtons = findElements(customTarget, (entry) => entry.tagName === "BUTTON");
  click(saveButtons[saveButtons.length - 1]!);
  await flush();
  assert.equal(customPayloads[0]?.decision, "custom");
  assert.equal((customPayloads[0]?.purposes as { personalized_ads?: boolean }).personalized_ads, false);

  clearConsent();
  const bypassTarget = new FakeElement("div");
  mountWavebirdAd({
    target: bypassTarget as unknown as HTMLElement,
    decision: filledDecision,
    sendBeacon: async () => ({ accepted: true, reason_code: "OK" }),
    jurisdictionZone: "eu_strict",
    disableConsentCollection: true,
  });
  assert.match(collectText(bypassTarget), /Explore weekend travel deals/);

  clearConsent();
  const explicitConsentTarget = new FakeElement("div");
  mountWavebirdAd({
    target: explicitConsentTarget as unknown as HTMLElement,
    decision: filledDecision,
    sendBeacon: async () => ({ accepted: true, reason_code: "OK" }),
    jurisdictionZone: "eu_strict",
    consentString: "WRAPPER_CONSENT",
  });
  assert.match(collectText(explicitConsentTarget), /Explore weekend travel deals/);

  clearConsent();
  const errorTarget = new FakeElement("div");
  const errors: string[] = [];
  mountWavebirdAd({
    target: errorTarget as unknown as HTMLElement,
    decision: filledDecision,
    sendBeacon: async () => ({ accepted: true, reason_code: "OK" }),
    jurisdictionZone: "eu_strict",
    onError: (error) => {
      errors.push(error.message);
    },
  });
  assert.equal(errors[0], "wavebird_consent_retry_not_configured");
  assert.match(collectText(errorTarget), /wavebird_consent_retry_not_configured/);
} finally {
  Object.assign(globalThis, {
    HTMLElement: originalHTMLElement,
    document: originalDocument,
    IntersectionObserver: originalIntersectionObserver,
    localStorage: originalLocalStorage,
  });
}

console.log("sdk/consent-widget.test.tsx ok");
