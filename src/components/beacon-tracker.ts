import type { PublicVastTrackingSet } from "../public_contracts.js";
import type { BeaconRequest } from "../types.js";
import type { BeaconSender } from "./types.js";

export type { BeaconSender } from "./types.js";

export interface BeaconTrackerOptions {
  assetToken: string;
  creativeType: string;
  sendBeacon: BeaconSender;
  element: HTMLElement;
  videoElement?: HTMLVideoElement;
  vastTracking?: PublicVastTrackingSet;
  onError?: (err: Error) => void;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(typeof error === "string" ? error : "wavebird_beacon_failed");
}

function createUuidFallback(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const nibble = character === "x" ? random : (random & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

function createBeaconId(): string {
  return globalThis.crypto?.randomUUID?.() ?? createUuidFallback();
}

function createBeaconRequest(assetToken: string, beaconType: BeaconRequest["beacon_type"]): BeaconRequest {
  return {
    beacon_id: createBeaconId(),
    asset_token: assetToken,
    beacon_type: beaconType,
    occurred_at_ms_client: Date.now(),
  };
}

function normalizeTrackingUrls(urls: string[]): string[] {
  return urls
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function sendPixelWithImage(url: string): void {
  if (typeof globalThis.Image !== "function") {
    return;
  }
  const pixel = new globalThis.Image();
  pixel.src = url;
}

function fireTrackingPixel(url: string, onError?: (err: Error) => void): void {
  try {
    if (typeof globalThis.fetch === "function") {
      void globalThis.fetch(url, {
        mode: "no-cors",
      }).catch(() => {
        try {
          sendPixelWithImage(url);
        } catch (error) {
          onError?.(normalizeError(error));
        }
      });
      return;
    }
    sendPixelWithImage(url);
  } catch (error) {
    onError?.(normalizeError(error));
  }
}

export function fireTrackingPixels(urls: string[], onError?: (err: Error) => void): void {
  for (const url of normalizeTrackingUrls(urls)) {
    fireTrackingPixel(url, onError);
  }
}

export function startBeaconTracking(options: BeaconTrackerOptions): () => void {
  let visibilityStarted = false;
  let visibilityEnded = false;
  let playStarted = false;
  let playCompleted = false;
  let vastImpressionFired = false;
  let vastStartFired = false;
  let vastFirstQuartileFired = false;
  let vastMidpointFired = false;
  let vastThirdQuartileFired = false;
  let vastCompleteFired = false;
  let playbackPaused = false;

  const emit = (beaconType: BeaconRequest["beacon_type"]) => {
    Promise.resolve(options.sendBeacon(createBeaconRequest(options.assetToken, beaconType))).catch((error) => {
      options.onError?.(normalizeError(error));
    });
  };

  const fireVastEvent = (urls: string[]) => {
    fireTrackingPixels(urls, options.onError);
  };

  const flushVisibilityEnded = () => {
    if (!visibilityStarted || visibilityEnded) {
      return;
    }
    visibilityEnded = true;
    emit("visible_ended");
  };

  emit("rendered");

  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
        if (visible && !visibilityStarted) {
          visibilityStarted = true;
          emit("visible_started");
          return;
        }
        if (!visible && visibilityStarted && !visibilityEnded) {
          flushVisibilityEnded();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(options.element);
  }

  const removePageLifecycleListeners: Array<() => void> = [];
  const attachLifecycleListener = (
    target: EventTarget | undefined,
    type: string,
    listener: EventListener
  ) => {
    if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") {
      return;
    }
    target.addEventListener(type, listener);
    removePageLifecycleListeners.push(() => target.removeEventListener(type, listener));
  };

  const handleDocumentVisibilityChange: EventListener = () => {
    if (globalThis.document?.visibilityState === "hidden") {
      flushVisibilityEnded();
    }
  };
  const handlePageHide: EventListener = () => {
    flushVisibilityEnded();
  };
  const handleOffline: EventListener = () => {
    flushVisibilityEnded();
  };

  attachLifecycleListener(globalThis.document, "visibilitychange", handleDocumentVisibilityChange);
  attachLifecycleListener(globalThis.window, "pagehide", handlePageHide);
  attachLifecycleListener(globalThis.window, "offline", handleOffline);

  let handleVideoLoadedData: (() => void) | null = null;
  let handleVideoPlay: (() => void) | null = null;
  let handleVideoPause: (() => void) | null = null;
  let handleVideoTimeUpdate: (() => void) | null = null;
  let handleVideoEnded: (() => void) | null = null;
  if (options.videoElement) {
    handleVideoLoadedData = () => {
      if (vastImpressionFired) {
        return;
      }
      vastImpressionFired = true;
      fireVastEvent(options.vastTracking?.impression ?? []);
    };
    handleVideoPlay = () => {
      if (!playStarted) {
        playStarted = true;
        emit("play_started");
      }
      if (!vastStartFired) {
        vastStartFired = true;
        playbackPaused = false;
        fireVastEvent(options.vastTracking?.start ?? []);
        return;
      }
      if (playbackPaused) {
        playbackPaused = false;
        fireVastEvent(options.vastTracking?.resume ?? []);
      }
    };
    handleVideoPause = () => {
      if (!vastStartFired || vastCompleteFired) {
        return;
      }
      const duration = options.videoElement?.duration;
      const currentTime = options.videoElement?.currentTime ?? 0;
      if (typeof duration === "number" && Number.isFinite(duration) && duration > 0 && currentTime >= duration) {
        return;
      }
      playbackPaused = true;
      fireVastEvent(options.vastTracking?.pause ?? []);
    };
    handleVideoTimeUpdate = () => {
      const duration = options.videoElement?.duration;
      const currentTime = options.videoElement?.currentTime ?? 0;
      if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
        return;
      }
      const progress = currentTime / duration;
      if (!vastFirstQuartileFired && progress >= 0.25) {
        vastFirstQuartileFired = true;
        fireVastEvent(options.vastTracking?.firstQuartile ?? []);
      }
      if (!vastMidpointFired && progress >= 0.5) {
        vastMidpointFired = true;
        fireVastEvent(options.vastTracking?.midpoint ?? []);
      }
      if (!vastThirdQuartileFired && progress >= 0.75) {
        vastThirdQuartileFired = true;
        fireVastEvent(options.vastTracking?.thirdQuartile ?? []);
      }
    };
    handleVideoEnded = () => {
      playbackPaused = false;
      if (!playCompleted) {
        playCompleted = true;
        emit("play_completed");
      }
      if (vastCompleteFired) {
        return;
      }
      vastCompleteFired = true;
      fireVastEvent(options.vastTracking?.complete ?? []);
    };
    options.videoElement.addEventListener("loadeddata", handleVideoLoadedData);
    options.videoElement.addEventListener("play", handleVideoPlay);
    options.videoElement.addEventListener("pause", handleVideoPause);
    options.videoElement.addEventListener("timeupdate", handleVideoTimeUpdate);
    options.videoElement.addEventListener("ended", handleVideoEnded);
  }

  return () => {
    observer?.disconnect();
    for (const removeListener of removePageLifecycleListeners) {
      removeListener();
    }
    if (
      options.videoElement &&
      handleVideoLoadedData &&
      handleVideoPlay &&
      handleVideoPause &&
      handleVideoTimeUpdate &&
      handleVideoEnded
    ) {
      options.videoElement.removeEventListener("loadeddata", handleVideoLoadedData);
      options.videoElement.removeEventListener("play", handleVideoPlay);
      options.videoElement.removeEventListener("pause", handleVideoPause);
      options.videoElement.removeEventListener("timeupdate", handleVideoTimeUpdate);
      options.videoElement.removeEventListener("ended", handleVideoEnded);
    }
    flushVisibilityEnded();
  };
}
