import { warnSdkDeprecation } from "./deprecation.js";

export const AD_TIMING_MODES = ["before", "while", "after"] as const;

export type AdTimingMode = (typeof AD_TIMING_MODES)[number];

export const AD_TIMING_PHASES = ["before_inference", "during_inference", "after_inference"] as const;

export type AdTimingPhase = (typeof AD_TIMING_PHASES)[number];

export type AdTimingPlan = {
  mode: AdTimingMode;
  request_phase: AdTimingPhase;
  render_phase: AdTimingPhase;
  keep_mounted_after_inference: boolean;
};

const TIMING_PLANS: Record<AdTimingMode, Omit<AdTimingPlan, "mode">> = {
  before: {
    request_phase: "before_inference",
    render_phase: "before_inference",
    keep_mounted_after_inference: true,
  },
  while: {
    request_phase: "during_inference",
    render_phase: "during_inference",
    keep_mounted_after_inference: false,
  },
  after: {
    request_phase: "after_inference",
    render_phase: "after_inference",
    keep_mounted_after_inference: false,
  },
};

function warnTimingDeprecation(): void {
  warnSdkDeprecation(
    "resolveAdTimingPlan",
    "resolveAdTimingPlan is deprecated. Stage 1 moves timing and delivery policy server-side; keep this helper only for legacy compatibility."
  );
}

/**
 * Returns the canonical wrapper-side orchestration plan for the three supported
 * ad timing modes: before inference, during inference, and after inference.
 *
 * @deprecated Timing policy is now server-side. This helper remains for legacy compatibility only.
 */
export function resolveAdTimingPlan(mode: AdTimingMode): AdTimingPlan {
  warnTimingDeprecation();
  const plan = TIMING_PLANS[mode];
  return {
    mode,
    request_phase: plan.request_phase,
    render_phase: plan.render_phase,
    keep_mounted_after_inference: plan.keep_mounted_after_inference,
  };
}
