"use client";

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { CONSENT_DIALOG_COPY } from "./dialog-copy.js";
import {
  getAcceptAllPurposes,
  getBasicAdsOnlyPurposes,
  getDefaultConsentPurposes,
  resolveConsentLocale,
  type ConsentDecision,
  type ConsentPurposes,
} from "./consent-store.js";

export type ConsentDialogProps = {
  locale?: string;
  primaryColor?: string;
  initialPurposes?: Partial<ConsentPurposes>;
  error?: string | null;
  onDecision: (payload: { decision: ConsentDecision; purposes: ConsentPurposes }) => Promise<void> | void;
};

function mergePurposes(overrides?: Partial<ConsentPurposes>): ConsentPurposes {
  return {
    ...getDefaultConsentPurposes(),
    ...getAcceptAllPurposes(),
    ...(overrides ?? {}),
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "wavebird_consent_retry_failed";
}

export function ConsentDialog(props: ConsentDialogProps) {
  const locale = resolveConsentLocale(props.locale ?? globalThis.navigator?.language ?? "en");
  const copy = CONSENT_DIALOG_COPY[locale];
  const primaryColor = props.primaryColor?.trim() || "#0f172a";
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [purposes, setPurposes] = useState<ConsentPurposes>(() => mergePurposes(props.initialPurposes));
  const visibleError = props.error ?? localError;

  const styles = useMemo(
    () =>
      ({
        card: {
          display: "grid",
          gap: "0.875rem",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          borderRadius: "16px",
          background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
          padding: "1rem",
          boxShadow: "0 14px 32px rgba(15, 23, 42, 0.08)",
          color: "#0f172a",
        },
        body: {
          margin: 0,
          fontSize: "0.95rem",
          lineHeight: 1.5,
        },
        actions: {
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
        },
        primaryButton: {
          appearance: "none",
          border: "none",
          borderRadius: "999px",
          padding: "0.75rem 1rem",
          fontWeight: 600,
          background: primaryColor,
          color: "#ffffff",
          cursor: busy ? "progress" : "pointer",
        },
        secondaryButton: {
          appearance: "none",
          border: `1px solid ${primaryColor}`,
          borderRadius: "999px",
          padding: "0.75rem 1rem",
          fontWeight: 600,
          background: "transparent",
          color: primaryColor,
          cursor: busy ? "progress" : "pointer",
        },
        linkButton: {
          appearance: "none",
          border: "none",
          background: "transparent",
          color: primaryColor,
          padding: 0,
          fontSize: "0.875rem",
          textAlign: "left",
          cursor: busy ? "default" : "pointer",
        },
        purposeList: {
          display: "grid",
          gap: "0.625rem",
          paddingTop: "0.25rem",
        },
        purposeRow: {
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          fontSize: "0.9rem",
        },
        error: {
          margin: 0,
          color: "#b91c1c",
          fontSize: "0.85rem",
        },
      }) satisfies Record<string, CSSProperties>,
    [busy, primaryColor]
  );

  const submit = async (decision: ConsentDecision, nextPurposes: ConsentPurposes) => {
    setBusy(true);
    setLocalError(null);
    try {
      await props.onDecision({
        decision,
        purposes: nextPurposes,
      });
    } catch (error) {
      setLocalError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-wavebird-consent-card="inline" style={styles.card}>
      <p style={styles.body}>{copy.body}</p>
      <div style={styles.actions}>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={busy}
          onClick={() => void submit("accept_all", getAcceptAllPurposes())}
        >
          {copy.accept_personalized}
        </button>
        <button
          type="button"
          style={styles.secondaryButton}
          disabled={busy}
          onClick={() => void submit("reject_personalization", getBasicAdsOnlyPurposes())}
        >
          {copy.use_basic_ads}
        </button>
      </div>
      <button
        type="button"
        style={styles.linkButton}
        disabled={busy}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? copy.hide_customize : copy.customize}
      </button>
      {expanded ? (
        <div style={styles.purposeList}>
          {(Object.keys(copy.purpose_labels) as Array<keyof ConsentPurposes>).map((purpose) => (
            <label key={purpose} style={styles.purposeRow}>
              <input
                type="checkbox"
                checked={purposes[purpose]}
                disabled={busy}
                onChange={(event) =>
                  setPurposes((current) => ({
                    ...current,
                    [purpose]: event.target.checked,
                  }))
                }
                style={{ accentColor: primaryColor } as CSSProperties}
              />
              <span>{copy.purpose_labels[purpose]}</span>
            </label>
          ))}
          <button
            type="button"
            style={styles.secondaryButton}
            disabled={busy}
            onClick={() => void submit("custom", { ...purposes })}
          >
            {copy.save_preferences}
          </button>
        </div>
      ) : null}
      {visibleError ? <p style={styles.error}>{visibleError}</p> : null}
    </div>
  );
}
