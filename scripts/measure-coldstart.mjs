import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  ensureSdkBuild,
  getBuiltSdkModule,
  reportDate,
  startBenchmarkServer,
  writeReport,
} from "./benchmark-helpers.mjs";

const sampleMode = process.argv.includes("--sample");

if (sampleMode) {
  const benchmarkServer = await startBenchmarkServer();
  try {
    const importStart = performance.now();
    const sdkModule = await import(getBuiltSdkModule("index.js"));
    const importEnd = performance.now();

    const observedErrors = [];
    const clientStart = performance.now();
    const client = new sdkModule.WavebirdClient({
      baseUrl: benchmarkServer.baseUrl,
      getApiKey: () => "bench-key",
      decisionDelivery: "polling",
      options: {
        onError: (error) => {
          observedErrors.push({
            code: error?.code ?? "unknown",
            message: error?.message ?? "unknown",
            cause:
              error?.cause instanceof Error
                ? error.cause.message
                : error?.cause ?? null,
          });
        },
      },
    });
    const clientEnd = performance.now();

    const createJobStart = performance.now();
    const job = await client.createJob({ job_type: "chat" });
    const createJobEnd = performance.now();
    if (!job || !("slot_ids" in job) || !job.slot_ids[0]) {
      throw new Error(
        `coldstart_job_failed:${JSON.stringify({
          baseUrl: benchmarkServer.baseUrl,
          job,
          observedErrors,
        })}`
      );
    }

    const getDecisionStart = performance.now();
    await client.getDecision(job.slot_ids[0]);
    const getDecisionEnd = performance.now();

    process.stdout.write(
      JSON.stringify({
        import_ms: importEnd - importStart,
        client_ms: clientEnd - clientStart,
        create_job_ms: createJobEnd - createJobStart,
        get_decision_ms: getDecisionEnd - getDecisionStart,
        total_ms: getDecisionEnd - importStart,
      })
    );
    process.exit(0);
  } finally {
    await benchmarkServer.close();
  }
}

ensureSdkBuild();
const samples = [];
for (let index = 0; index < 5; index += 1) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--sample"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (result.error) {
      process.stderr.write(`${String(result.error)}\n`);
    }
    if (result.stdout) {
      process.stderr.write(result.stdout);
    }
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  try {
    samples.push(JSON.parse(result.stdout));
  } catch (error) {
    process.stderr.write(`coldstart_sample_parse_failed: ${String(error)}\n`);
    if (result.stdout) {
      process.stderr.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(1);
  }
}

const average = (key) => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
const report = [
  "# SDK cold-start report",
  `Generated: ${reportDate}`,
  "",
  "| Stage | Time (avg of 5 runs) |",
  "|-------|---------------------|",
  `| Import SDK module | ${average("import_ms").toFixed(2)} ms |`,
  `| Create WavebirdClient | ${average("client_ms").toFixed(2)} ms |`,
  `| First createJob() call | ${average("create_job_ms").toFixed(2)} ms |`,
  `| First getDecision() call | ${average("get_decision_ms").toFixed(2)} ms |`,
  `| Total cold-start to first decision | ${average("total_ms").toFixed(2)} ms |`,
  "",
  "## Budget",
  "Target: <50ms total cold-start to first decision (mocked).",
  "Network latency adds on top in production.",
  "",
].join("\n");

writeReport("COLDSTART-REPORT.md", report);
