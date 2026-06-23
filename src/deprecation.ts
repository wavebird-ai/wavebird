type DeprecationWarningRegistry = typeof globalThis & {
  __cslSdkDeprecationWarnings?: Set<string>;
};

export function warnSdkDeprecation(key: string, message: string): void {
  if (typeof console?.warn !== "function") {
    return;
  }
  const registry = globalThis as DeprecationWarningRegistry;
  const warnings = registry.__cslSdkDeprecationWarnings ?? new Set<string>();
  if (warnings.has(key)) {
    return;
  }
  warnings.add(key);
  registry.__cslSdkDeprecationWarnings = warnings;
  console.warn(message);
}
