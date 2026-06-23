import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureSdkBuild, formatHeap, getBuiltSdkModule, reportDate, startBenchmarkServer, writeReport } from "./benchmark-helpers.mjs";

if (!process.execArgv.includes("--expose-gc")) {
  const result = spawnSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 25));
const measureHeap = async () => {
  global.gc?.();
  await pause();
  return process.memoryUsage().heapUsed;
};

ensureSdkBuild();

const benchmarkServer = await startBenchmarkServer();

try {
  const stages = [];
  stages.push({ label: "Baseline (before import)", heapUsed: await measureHeap() });

  const sdkModule = await import(getBuiltSdkModule("index.js"));
  stages.push({ label: "After import", heapUsed: await measureHeap() });

  const client = new sdkModule.WavebirdClient({
    baseUrl: benchmarkServer.baseUrl,
    getApiKey: () => "bench-key",
    decisionDelivery: "polling",
  });
  stages.push({ label: "After WavebirdClient() creation", heapUsed: await measureHeap() });

  const retainedJobs = [];
  for (let index = 0; index < 10; index += 1) {
    retainedJobs.push(await client.createJob({ job_type: "chat" }));
  }
  stages.push({ label: "After 10 createJob() calls", heapUsed: await measureHeap() });

  for (let index = 0; index < 100; index += 1) {
    retainedJobs.push(await client.createJob({ job_type: "chat" }));
  }
  stages.push({ label: "After 100 createJob() calls", heapUsed: await measureHeap() });

  retainedJobs.length = 0;
  stages.push({ label: "After GC", heapUsed: await measureHeap() });

  const baseline = stages[0]?.heapUsed ?? 0;
  const report = [
    "# SDK memory report",
    `Generated: ${reportDate}`,
    "",
    "| Stage | Heap used | Delta |",
    "|-------|-----------|-------|",
    ...stages.map((stage, index) => {
      const delta = index === 0 ? "—" : formatHeap(stage.heapUsed - baseline);
      return `| ${stage.label} | ${formatHeap(stage.heapUsed)} | ${delta} |`;
    }),
    "",
    "## Budget",
    "Target: <500kB heap increase for client creation.",
    "Target: <50kB per concurrent job.",
    "",
  ].join("\n");

  writeReport("MEMORY-REPORT.md", report);
} finally {
  await benchmarkServer.close();
}
