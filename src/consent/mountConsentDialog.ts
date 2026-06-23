import { CONSENT_DIALOG_COPY } from "./dialog-copy.js";
import {
  getAcceptAllPurposes,
  getBasicAdsOnlyPurposes,
  getDefaultConsentPurposes,
  resolveConsentLocale,
  type ConsentDecision,
  type ConsentPurposes,
} from "./consent-store.js";

export type MountConsentDialogOptions = {
  target: HTMLElement | null;
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

function setStyles(element: HTMLElement, styles: Record<string, string>): void {
  Object.assign(element.style, styles);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "wavebird_consent_retry_failed";
}

export function mountConsentDialog(options: MountConsentDialogOptions): () => void {
  if (!(options.target instanceof HTMLElement)) {
    throw new Error("mountConsentDialog target must be an HTMLElement");
  }

  const target = options.target;
  const locale = resolveConsentLocale(options.locale ?? globalThis.navigator?.language ?? "en");
  const copy = CONSENT_DIALOG_COPY[locale];
  const primaryColor = options.primaryColor?.trim() || "#0f172a";
  let purposes = mergePurposes(options.initialPurposes);
  let expanded = false;
  let busy = false;
  let currentError = options.error ?? null;
  const detachListeners: Array<() => void> = [];
  const clearListeners = () => {
    for (const detach of detachListeners.splice(0, detachListeners.length)) {
      detach();
    }
  };

  const render = () => {
    clearListeners();
    target.replaceChildren();

    const card = document.createElement("div");
    card.setAttribute("data-wavebird-consent-card", "inline");
    setStyles(card, {
      display: "grid",
      gap: "0.875rem",
      border: "1px solid rgba(148, 163, 184, 0.35)",
      borderRadius: "16px",
      background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
      padding: "1rem",
      boxShadow: "0 14px 32px rgba(15, 23, 42, 0.08)",
      color: "#0f172a",
    });

    const body = document.createElement("p");
    body.textContent = copy.body;
    setStyles(body, {
      margin: "0",
      fontSize: "0.95rem",
      lineHeight: "1.5",
    });
    card.appendChild(body);

    const actions = document.createElement("div");
    setStyles(actions, {
      display: "flex",
      flexWrap: "wrap",
      gap: "0.75rem",
    });

    const createButton = (text: string, variant: "primary" | "secondary") => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.disabled = busy;
      setStyles(button, {
        appearance: "none",
        borderRadius: "999px",
        padding: "0.75rem 1rem",
        fontWeight: "600",
        cursor: busy ? "progress" : "pointer",
        ...(variant === "primary"
          ? {
              border: "none",
              background: primaryColor,
              color: "#ffffff",
            }
          : {
              border: `1px solid ${primaryColor}`,
              background: "transparent",
              color: primaryColor,
            }),
      });
      return button;
    };

    const submit = async (decision: ConsentDecision, nextPurposes: ConsentPurposes) => {
      busy = true;
      currentError = null;
      render();
      try {
        await options.onDecision({
          decision,
          purposes: nextPurposes,
        });
      } catch (error) {
        currentError = toErrorMessage(error);
        busy = false;
        render();
        return;
      }
    };

    const acceptButton = createButton(copy.accept_personalized, "primary");
    const handleAccept = () => {
      void submit("accept_all", getAcceptAllPurposes());
    };
    acceptButton.addEventListener("click", handleAccept);
    detachListeners.push(() => acceptButton.removeEventListener("click", handleAccept));
    actions.appendChild(acceptButton);

    const basicButton = createButton(copy.use_basic_ads, "secondary");
    const handleBasic = () => {
      void submit("reject_personalization", getBasicAdsOnlyPurposes());
    };
    basicButton.addEventListener("click", handleBasic);
    detachListeners.push(() => basicButton.removeEventListener("click", handleBasic));
    actions.appendChild(basicButton);

    card.appendChild(actions);

    const customizeButton = document.createElement("button");
    customizeButton.type = "button";
    customizeButton.textContent = expanded ? copy.hide_customize : copy.customize;
    customizeButton.disabled = busy;
    setStyles(customizeButton, {
      appearance: "none",
      border: "none",
      background: "transparent",
      color: primaryColor,
      padding: "0",
      fontSize: "0.875rem",
      textAlign: "left",
      cursor: busy ? "default" : "pointer",
    });
    const handleCustomize = () => {
      expanded = !expanded;
      render();
    };
    customizeButton.addEventListener("click", handleCustomize);
    detachListeners.push(() => customizeButton.removeEventListener("click", handleCustomize));
    card.appendChild(customizeButton);

    if (expanded) {
      const purposeList = document.createElement("div");
      setStyles(purposeList, {
        display: "grid",
        gap: "0.625rem",
        paddingTop: "0.25rem",
      });
      for (const purpose of Object.keys(copy.purpose_labels) as Array<keyof ConsentPurposes>) {
        const label = document.createElement("label");
        setStyles(label, {
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          fontSize: "0.9rem",
        });
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = purposes[purpose];
        input.disabled = busy;
        input.style.accentColor = primaryColor;
        const handleChange = () => {
          purposes = {
            ...purposes,
            [purpose]: input.checked,
          };
        };
        input.addEventListener("change", handleChange);
        detachListeners.push(() => input.removeEventListener("change", handleChange));
        const text = document.createElement("span");
        text.textContent = copy.purpose_labels[purpose];
        label.appendChild(input);
        label.appendChild(text);
        purposeList.appendChild(label);
      }
      const saveButton = createButton(copy.save_preferences, "secondary");
      const handleSave = () => {
        void submit("custom", { ...purposes });
      };
      saveButton.addEventListener("click", handleSave);
      detachListeners.push(() => saveButton.removeEventListener("click", handleSave));
      purposeList.appendChild(saveButton);
      card.appendChild(purposeList);
    }

    if (currentError) {
      const error = document.createElement("p");
      error.textContent = currentError;
      setStyles(error, {
        margin: "0",
        color: "#b91c1c",
        fontSize: "0.85rem",
      });
      card.appendChild(error);
    }

    target.replaceChildren(card);
  };

  render();

  return () => {
    clearListeners();
    target.replaceChildren();
  };
}
