/**
 * Clamps a numeric option to an inclusive integer range.
 *
 * Non-finite or missing values resolve to `fallback`.
 *
 * @param value - Candidate value provided by the caller.
 * @param min - Inclusive lower bound.
 * @param max - Inclusive upper bound.
 * @param fallback - Default value used when `value` is missing or non-finite.
 * @returns A safe integer within the requested range.
 */
export const clampInt = (value: number | undefined, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
