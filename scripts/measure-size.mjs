import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import path from "node:path";
import { ensureSdkBuild, externalNodeModules, formatKiB, reportDate, sdkRoot, writeReport } from "./benchmark-helpers.mjs";

const checkMode = process.argv.includes("--check");
const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const entries = [
  {
    label: "wavebird (server)",
    relativePath: path.join("dist", "sdk", "src", "index.js"),
    platform: "node",
    budgetGzipBytes: 20 * 1024,
  },
  {
    label: "wavebird/react",
    relativePath: path.join("dist", "sdk", "src", "components", "WavebirdAd.js"),
    platform: "browser",
    budgetGzipBytes: 15 * 1024,
  },
  {
    label: "wavebird/mount",
    relativePath: path.join("dist", "sdk", "src", "components", "mountWavebirdAd.js"),
    platform: "browser",
    budgetGzipBytes: 15 * 1024,
  },
];

ensureSdkBuild();

const rows = [];
const violations = [];

for (const entry of entries) {
  const absolutePath = path.resolve(sdkRoot, entry.relativePath);
  const rawBytes = statSync(absolutePath).size;
  const result = await esbuild.build({
    entryPoints: [absolutePath],
    bundle: true,
    format: "esm",
    minify: true,
    treeShaking: true,
    platform: entry.platform,
    external: [...externalNodeModules, "react", "react-dom"],
    write: false,
    logLevel: "silent",
  });
  const bundled = result.outputFiles?.[0];
  if (!bundled) {
    throw new Error(`size_bundle_missing:${entry.label}`);
  }
  const minifiedBytes = bundled.contents.byteLength;
  const gzipBytes = gzipSync(bundled.contents).byteLength;
  const brotliBytes = brotliCompressSync(bundled.contents, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
    },
  }).byteLength;

  rows.push({
    label: entry.label,
    rawBytes,
    minifiedBytes,
    gzipBytes,
    brotliBytes,
  });

  if (gzipBytes > entry.budgetGzipBytes) {
    violations.push(`${entry.label} gzip size ${formatKiB(gzipBytes)} exceeds budget ${formatKiB(entry.budgetGzipBytes)}`);
  }
}

const report = [
  "# SDK size report",
  `Generated: ${reportDate}`,
  "",
  "| Entry point | Raw | Minified | Gzip | Brotli |",
  "|------------|-----|----------|------|--------|",
  ...rows.map(
    (row) =>
      `| ${row.label} | ${formatKiB(row.rawBytes)} | ${formatKiB(row.minifiedBytes)} | ${formatKiB(row.gzipBytes)} | ${formatKiB(row.brotliBytes)} |`
  ),
  "",
  "## Budget",
  "Target: <20kB gzipped for the server entry point.",
  "Target: <15kB gzipped for react and mount entry points.",
  "",
  violations.length === 0 ? "Status: PASS" : `Status: FAIL\n\n${violations.map((entry) => `- ${entry}`).join("\n")}`,
  "",
].join("\n");

writeReport("SIZE-REPORT.md", report);

if (checkMode && violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}
