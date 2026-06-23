import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const warnings: string[] = [];
const originalWarn = console.warn;

console.warn = (...args: unknown[]) => {
  warnings.push(args.map((value) => String(value)).join(" "));
};

try {
  const distRoot = path.resolve(process.cwd(), "dist/sdk/src");
  await import(`${pathToFileURL(path.resolve(distRoot, "index.js")).href}?deprecation-root`);
  await import(`${pathToFileURL(path.resolve(distRoot, "components/mountWavebirdAd.js")).href}?deprecation-mount`);
} finally {
  console.warn = originalWarn;
}

assert.ok(warnings.some((warning) => warning.includes("wavebird is now an advanced compatibility layer")));
assert.ok(warnings.some((warning) => warning.includes("mountWavebirdAd is deprecated")));

console.log("sdk/deprecation-warnings.test.ts ok");
