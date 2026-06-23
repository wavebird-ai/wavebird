import assert from "node:assert/strict";
import { fireTrackingPixels, startBeaconTracking } from "../src/components/beacon-tracker.js";
import { mountWavebirdAd } from "../src/components/mountWavebirdAd.js";
import type { DecisionResponse } from "../src/types.js";

type Listener = (...args: unknown[]) => void;

class FakeEventTarget {
  eventListeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.eventListeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.eventListeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.eventListeners.get(type) ?? []) {
      listener();
    }
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
  src = "";
  type = "";
  controls = false;
  playsInline = false;
  preload = "";
  loading = "";
  alt = "";
  currentTime = 0;
  duration = 0;

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

  dispatch(type: string): void {
    for (const listener of this.eventListeners.get(type) ?? []) {
      listener();
    }
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === "hidden") {
      this.hidden = true;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
    if (name === "hidden") {
      this.hidden = false;
    }
  }
}

function findElements(node: FakeElement, predicate: (entry: FakeElement) => boolean): FakeElement[] {
  const matches = predicate(node) ? [node] : [];
  for (const child of node.children) {
    matches.push(...findElements(child, predicate));
  }
  return matches;
}

const originalHTMLElement = globalThis.HTMLElement;
const originalDocument = globalThis.document;
const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalMutationObserver = globalThis.MutationObserver;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;
const originalImage = globalThis.Image;

const imagePixels: string[] = [];
class FakeImage {
  set src(value: string) {
    imagePixels.push(value);
  }
}

try {
  Object.assign(globalThis, {
    Image: FakeImage,
  });
  delete (globalThis as { fetch?: unknown }).fetch;

  fireTrackingPixels(["https://track.example/fallback"], undefined);
  assert.deepEqual(imagePixels, ["https://track.example/fallback"]);

  const fetchedPixels: string[] = [];
  const openedWindows: Array<[string, string, string]> = [];
  const fakeDocument = Object.assign(new FakeEventTarget(), {
    createElement: (tagName: string) => new FakeElement(tagName),
    visibilityState: "visible" as "visible" | "hidden",
  });
  const fakeWindow = Object.assign(new FakeEventTarget(), {
    open: (url: string, target: string, features: string) => {
      openedWindows.push([url, target, features]);
    },
    location: {
      assign: () => {},
    },
  });
  let activeIntersectionObserver:
    | {
        callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void;
      }
    | null = null;
  class FakeIntersectionObserver {
    constructor(callback: (entries: Array<{ isIntersecting: boolean; intersectionRatio: number }>) => void) {
      activeIntersectionObserver = { callback };
    }

    observe(): void {}

    disconnect(): void {}
  }
  Object.assign(globalThis, {
    HTMLElement: FakeElement,
    document: fakeDocument,
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: undefined,
    fetch: async (url: string) => {
      fetchedPixels.push(url);
      return { ok: true } as Response;
    },
    Image: FakeImage,
    window: fakeWindow,
  });

  const beaconTypes: string[] = [];
  const trackerElement = new FakeElement("div");
  const videoElement = new FakeElement("video");
  videoElement.duration = 4;
  const stopTracking = startBeaconTracking({
    assetToken: "asset_clip_1",
    creativeType: "clip",
    sendBeacon: async (request) => {
      beaconTypes.push(request.beacon_type);
      return { accepted: true, reason_code: "OK" };
    },
    element: trackerElement as unknown as HTMLElement,
    videoElement: videoElement as unknown as HTMLVideoElement,
    vastTracking: {
      impression: ["https://track.example/impression"],
      start: ["https://track.example/start"],
      firstQuartile: ["https://track.example/first"],
      midpoint: ["https://track.example/mid"],
      thirdQuartile: ["https://track.example/third"],
      complete: ["https://track.example/complete"],
      pause: ["https://track.example/pause"],
      resume: ["https://track.example/resume"],
      skip: [],
      mute: [],
      unmute: [],
      clickTracking: ["https://track.example/click"],
      clickThrough: "https://click.example/landing",
    },
  });

  videoElement.dispatch("loadeddata");
  videoElement.dispatch("play");
  videoElement.currentTime = 1;
  videoElement.dispatch("timeupdate");
  videoElement.currentTime = 2;
  videoElement.dispatch("timeupdate");
  videoElement.currentTime = 3;
  videoElement.dispatch("timeupdate");
  videoElement.dispatch("pause");
  videoElement.dispatch("play");
  videoElement.dispatch("ended");
  videoElement.dispatch("play");
  videoElement.dispatch("ended");
  stopTracking();

  assert.deepEqual(beaconTypes, ["rendered", "play_started", "play_completed"]);
  assert.deepEqual(fetchedPixels, [
    "https://track.example/impression",
    "https://track.example/start",
    "https://track.example/first",
    "https://track.example/mid",
    "https://track.example/third",
    "https://track.example/pause",
    "https://track.example/resume",
    "https://track.example/complete",
  ]);

  const lifecycleBeaconTypes: string[] = [];
  const lifecycleElement = new FakeElement("div");
  const stopLifecycleTracking = startBeaconTracking({
    assetToken: "asset_banner_lifecycle",
    creativeType: "banner",
    sendBeacon: async (request) => {
      lifecycleBeaconTypes.push(request.beacon_type);
      return { accepted: true, reason_code: "OK" };
    },
    element: lifecycleElement as unknown as HTMLElement,
  });
  activeIntersectionObserver?.callback([{ isIntersecting: true, intersectionRatio: 0.75 }]);
  fakeDocument.visibilityState = "hidden";
  fakeDocument.dispatch("visibilitychange");
  fakeWindow.dispatch("pagehide");
  fakeWindow.dispatch("offline");
  stopLifecycleTracking();

  assert.deepEqual(lifecycleBeaconTypes, ["rendered", "visible_started", "visible_ended"]);

  const clipDecision: Extract<DecisionResponse, { fill: true }> = {
    slot_id: "slot_clip_1",
    status: "ready",
    fill: true,
    creative: {
      url: "https://cdn.example.com/clip.mp4",
      type: "clip",
      duration_ms: 4_000,
      width: 640,
      height: 360,
      mime_type: "video/mp4",
      click_through_url: "https://click.example/landing",
      vast_tracking: {
        impression: ["https://track.example/impression"],
        start: ["https://track.example/start"],
        firstQuartile: [],
        midpoint: [],
        thirdQuartile: [],
        complete: [],
        pause: [],
        resume: [],
        skip: [],
        mute: [],
        unmute: [],
        clickTracking: ["https://track.example/click"],
        clickThrough: "https://click.example/landing",
      },
      sponsor_name: "Clip Sponsor",
    },
    asset_token: "asset_clip_2",
    constraints: {
      mode: "clip",
      require_viewability_ms: 2_000,
    },
    cs_declaration: "CS-S (S1/P0)*",
    revenue_estimate: {
      gross_cpm: 9.5,
      estimated_net_per_impression: 0.0076,
      currency: "EUR",
    },
  };

  const mountBeaconTypes: string[] = [];
  const target = new FakeElement("div");
  const cleanup = mountWavebirdAd({
    target: target as unknown as HTMLElement,
    decision: clipDecision,
    sendBeacon: async (request) => {
      mountBeaconTypes.push(request.beacon_type);
      return { accepted: true, reason_code: "OK" };
    },
    disableConsentCollection: true,
  });
  const buttons = findElements(target, (entry) => entry.tagName === "BUTTON");
  assert.equal(buttons.length, 1);
  buttons[0]!.dispatch("click");
  cleanup();

  assert.deepEqual(mountBeaconTypes, ["rendered", "clicked"]);
  assert.deepEqual(fetchedPixels.slice(-1), ["https://track.example/click"]);
  assert.deepEqual(openedWindows, [["https://click.example/landing", "_blank", "noopener,noreferrer"]]);
} finally {
  Object.assign(globalThis, {
    HTMLElement: originalHTMLElement,
    document: originalDocument,
    IntersectionObserver: originalIntersectionObserver,
    MutationObserver: originalMutationObserver,
    window: originalWindow,
    fetch: originalFetch,
    Image: originalImage,
  });
}

console.log("sdk/beacon-tracker.test.ts ok");
