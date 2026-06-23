import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = path.join(sdkRoot, ".tmp", "sdk-test-runner");

const tests = [
  "tests/export-shape.test.ts",
  "tests/deprecation-warnings.test.ts",
  "tests/wavebird-client.test.ts",
  "tests/browser-client.test.ts",
  "tests/browser-verification.test.ts",
  "tests/consent-store.test.ts",
  "tests/tcf-string.test.ts",
  "tests/consent-widget.test.tsx",
  "tests/beacon-tracker.test.ts",
  "tests/decision-delivery.test.ts",
  "tests/renderer-native.test.ts",
];

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: sdkRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });

try {
  runNode(["scripts/build.mjs"], "sdk build");

  for (const testFile of tests) {
    const outfile = path.join(tempRoot, `${path.basename(testFile).replace(/\.(ts|tsx)$/u, "")}.mjs`);
    await build({
      entryPoints: [path.join(sdkRoot, testFile)],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      external: ["react", "react-dom", "react-dom/server"],
      logLevel: "silent",
    });
    runNode([outfile], testFile);
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

console.log("sdk_suite.runner.mjs ok");
