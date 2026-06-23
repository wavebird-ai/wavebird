import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WavebirdAd, type NativeAsset, type WavebirdNativeRenderProps } from "../src/components/WavebirdAd.js";
import { mountWavebirdAd } from "../src/components/mountWavebirdAd.js";
import type { DecisionResponse } from "../src/types.js";

const nativeDecision: Extract<DecisionResponse, { fill: true }> = {
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

type Listener = (...args: unknown[]) => void;
type MutationCallback = (
  records: Array<{ type: "attributes"; attributeName: string | null; target: FakeElement }>,
  observer: FakeMutationObserver
) => void;

const observersByElement = new Map<FakeElement, Set<FakeMutationObserver>>();

function notifyAttributeMutation(target: FakeElement, attributeName: string): void {
  for (const observer of observersByElement.get(target) ?? []) {
    observer.notify(target, attributeName);
  }
}

class FakeMutationObserver {
  private target: FakeElement | null = null;
  private attributeFilter: string[] | undefined;

  constructor(private readonly callback: MutationCallback) {}

  observe(target: FakeElement, options: { attributes?: boolean; attributeFilter?: string[] }): void {
    this.disconnect();
    this.target = target;
    this.attributeFilter = options.attributeFilter ? [...options.attributeFilter] : undefined;
    const observers = observersByElement.get(target) ?? new Set<FakeMutationObserver>();
    observers.add(this);
    observersByElement.set(target, observers);
  }

  disconnect(): void {
    if (!this.target) {
      return;
    }
    const observers = observersByElement.get(this.target);
    observers?.delete(this);
    if (observers && observers.size === 0) {
      observersByElement.delete(this.target);
    }
    this.target = null;
    this.attributeFilter = undefined;
  }

  notify(target: FakeElement, attributeName: string): void {
    if (this.attributeFilter && !this.attributeFilter.includes(attributeName)) {
      return;
    }
    this.callback([{ type: "attributes", attributeName, target }], this);
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
  hidden = false;

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
    if (name === "hidden") {
      this.hidden = true;
    }
    notifyAttributeMutation(this, name);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
    if (name === "hidden") {
      this.hidden = false;
    }
    notifyAttributeMutation(this, name);
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

function withNavigatorLanguage<T>(language: string, run: () => T): T {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language },
  });
  try {
    return run();
  } finally {
    if (originalNavigator) {
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
  }
}

function renderAdMarkup(
  language: string,
  props: Partial<React.ComponentProps<typeof WavebirdAd>> = {}
): string {
  return withNavigatorLanguage(language, () =>
    renderToStaticMarkup(
      React.createElement(WavebirdAd, {
        decision: nativeDecision,
        sendBeacon: async () => ({ accepted: true, reason_code: "OK" }),
        disableConsentCollection: true,
        ...props,
      })
    )
  );
}

function captureWarnings<T>(run: () => T): { result: T; warnings: string[] } {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((value) => String(value)).join(" "));
  };
  try {
    return {
      result: run(),
      warnings,
    };
  } finally {
    console.warn = originalWarn;
  }
}

const defaultMarkup = renderAdMarkup("en-US");
assert.match(defaultMarkup, /Explore weekend travel deals/);
assert.match(defaultMarkup, /Save on hand-picked city breaks\./);
assert.match(defaultMarkup, /Book now/);
assert.match(defaultMarkup, /Sponsored by Example Sponsor/);
assert.match(defaultMarkup, /https:\/\/cdn\.example\.com\/native-main\.png/);
assert.match(defaultMarkup, />Ad<\/span>/);

const typedNativeAsset: NativeAsset = nativeDecision.creative.native_assets!;
assert.equal(typedNativeAsset.title, "Explore weekend travel deals");

const customNativeRenderer = ({
  asset,
  sponsorName,
  clickUrl,
  ctaText,
  imageAlt,
  labelText,
}: WavebirdNativeRenderProps) =>
  React.createElement(
    "section",
    { "data-custom-native": "true" },
    React.createElement("img", { alt: imageAlt, src: asset.image_url }),
    React.createElement("strong", null, `Custom native: ${asset.title}`),
    React.createElement("span", null, sponsorName ?? "Sponsor"),
    React.createElement("a", { href: clickUrl ?? "#" }, ctaText),
    React.createElement("em", null, labelText)
  );

const customMarkup = renderAdMarkup("en-US", { renderNative: customNativeRenderer });
assert.match(customMarkup, /data-custom-native="true"/);
assert.match(customMarkup, /Custom native: Explore weekend travel deals/);
assert.match(customMarkup, /Example Sponsor/);
assert.match(customMarkup, /Book now/);
assert.match(customMarkup, /https:\/\/example\.com\/landing/);
assert.match(customMarkup, /alt="Explore weekend travel deals"/);
assert.doesNotMatch(customMarkup, /Save on hand-picked city breaks\./);

assert.match(renderAdMarkup("de-DE", { jurisdictionZone: "eu_strict" }), />Anzeige<\/span>/);
assert.match(renderAdMarkup("en-US", { jurisdictionZone: "eu_strict" }), />Sponsored<\/span>/);
assert.match(renderAdMarkup("en-US", { jurisdictionZone: "us_ccpa" }), />Ad<\/span>/);
assert.match(
  renderAdMarkup("fr-FR", { jurisdictionZone: "rest_of_world", consentLocale: "de-DE" }),
  />Publicité<\/span>/
);
assert.match(renderAdMarkup("en-US", { jurisdictionZone: "eu_strict", labelText: "Werbung" }), />Werbung<\/span>/);
assert.match(renderAdMarkup("en-US", { jurisdictionZone: "eu_strict", label: "Anzeige" }), />Anzeige<\/span>/);

const invalidEuLabel = captureWarnings(() =>
  renderAdMarkup("de-DE", {
    jurisdictionZone: "eu_strict",
    labelText: "Partner",
  })
);
assert.match(invalidEuLabel.result, />Anzeige<\/span>/);
assert.ok(invalidEuLabel.warnings.some((warning) => warning.includes('Invalid ad label "Partner"')));

const invalidUsLabel = captureWarnings(() =>
  renderAdMarkup("en-US", {
    jurisdictionZone: "us_ccpa",
    labelText: "A",
  })
);
assert.match(invalidUsLabel.result, />Ad<\/span>/);
assert.ok(invalidUsLabel.warnings.some((warning) => warning.includes('Invalid ad label "A"')));

const originalHTMLElement = globalThis.HTMLElement;
const originalDocument = globalThis.document;
const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalMutationObserver = globalThis.MutationObserver;

Object.assign(globalThis, {
  HTMLElement: FakeElement,
  document: {
    createElement: (tagName: string) => new FakeElement(tagName),
  },
  IntersectionObserver: undefined,
  MutationObserver: FakeMutationObserver,
});

try {
  const mounted = captureWarnings(() =>
    withNavigatorLanguage("en-US", () => {
      const target = new FakeElement("div");
      const beaconTypes: string[] = [];
      const cleanup = mountWavebirdAd({
        target: target as unknown as HTMLElement,
        decision: nativeDecision,
        sendBeacon: async (request) => {
          beaconTypes.push(request.beacon_type);
          return { accepted: true, reason_code: "OK" };
        },
        showLabel: false,
        labelText: "Sponsored",
        jurisdictionZone: "us_ccpa",
      });

      return { target, beaconTypes, cleanup };
    })
  );

  const { target, beaconTypes, cleanup } = mounted.result;
  assert.deepEqual(beaconTypes, ["rendered"]);
  assert.equal(target.children.length, 1);
  assert.ok(
    mounted.warnings.includes(
      "showLabel: false is no longer supported. Ad labels are always required. Use labelText to customize the label."
    )
  );

  const mountedRoot = target.children[0]!;
  const mountedText = collectText(mountedRoot);
  assert.match(mountedText, /Sponsored/);
  assert.match(mountedText, /Explore weekend travel deals/);
  assert.match(mountedText, /Save on hand-picked city breaks\./);
  assert.match(mountedText, /Book now/);
  assert.match(mountedText, /Sponsored by Example Sponsor/);

  const imageNodes = findElements(mountedRoot, (entry) => entry.tagName === "IMG");
  assert.ok(
    imageNodes.some(
      (entry) => (entry as unknown as { src?: string }).src === "https://cdn.example.com/native-main.png"
    )
  );
  assert.ok(
    imageNodes.some(
      (entry) => (entry as unknown as { src?: string }).src === "https://cdn.example.com/native-icon.png"
    )
  );

  const buttonNodes = findElements(mountedRoot, (entry) => entry.tagName === "BUTTON");
  assert.ok(buttonNodes.some((entry) => entry.textContent === "Book now"));

  const labelNode = findElements(mountedRoot, (entry) => entry.tagName === "SPAN" && entry.textContent === "Sponsored")[0]!;
  assert.equal(labelNode.style.fontSize, "11px");
  assert.equal(labelNode.style.padding, "2px 6px");
  assert.equal(labelNode.style.position, "relative");
  assert.equal(labelNode.style.opacity, "1");

  labelNode.style.opacity = "0.1";
  labelNode.style.fontSize = "8px";
  labelNode.setAttribute("style", "opacity:0.1;font-size:8px");
  labelNode.setAttribute("hidden", "");
  labelNode.setAttribute("aria-hidden", "true");

  assert.equal(labelNode.style.opacity, "1");
  assert.equal(labelNode.style.fontSize, "11px");
  assert.equal(labelNode.style.position, "relative");
  assert.equal(labelNode.style.padding, "2px 6px");
  assert.equal(labelNode.hasAttribute("hidden"), false);
  assert.equal(labelNode.hidden, false);
  assert.equal(labelNode.getAttribute("aria-hidden"), "false");

  cleanup();
  assert.equal(target.children.length, 0);
} finally {
  Object.assign(globalThis, {
    HTMLElement: originalHTMLElement,
    document: originalDocument,
    IntersectionObserver: originalIntersectionObserver,
    MutationObserver: originalMutationObserver,
  });
}

console.log("sdk/renderer-native.test.ts ok");
