import http from "node:http";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire, builtinModules } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export const sdkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const workspaceRoot = path.resolve(sdkRoot, "..");
export const reportDate = new Date().toISOString().slice(0, 10);
export const externalNodeModules = [...builtinModules, ...builtinModules.map((entry) => `node:${entry}`)];

const sdkRequire = createRequire(path.resolve(sdkRoot, "package.json"));

export function ensureSdkBuild() {
  const result = spawnSync(process.execPath, [path.resolve(sdkRoot, "scripts", "build.mjs")], {
    cwd: sdkRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function resolvePackage(specifier) {
  return sdkRequire.resolve(specifier);
}

export function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

export function formatHeap(bytes) {
  const absolute = Math.abs(bytes);
  if (absolute >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} kB`;
}

export function writeReport(filename, content) {
  writeFileSync(path.resolve(sdkRoot, filename), content, "utf8");
}

export function getBuiltSdkModule(relativePath) {
  return pathToFileURL(path.resolve(sdkRoot, "dist", "sdk", "src", relativePath)).href;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      resolve(body.length > 0 ? JSON.parse(body) : {});
    });
    req.on("error", reject);
  });
}

export async function startBenchmarkServer() {
  let counter = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("content-type", "application/json");

    if (req.method === "POST" && url.pathname === "/public/wrapper/v1/jobs") {
      await readRequestBody(req).catch(() => ({}));
      counter += 1;
      const slotId = `slot_${counter}`;
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          contract_version: "csl_wrapper_ingress_accepted/v1",
          job_id: `job_${counter}`,
          slot_ids: [slotId],
          status: "accepted",
          decision_delivery: {
            mode: "polling",
            decision_path_template: "/public/wrapper/v1/slots/{slot_id}/decision",
          },
        })
      );
      return;
    }

    if (req.method === "GET" && /^\/public\/wrapper\/v1\/slots\/[^/]+\/decision$/u.test(url.pathname)) {
      const slotId = url.pathname.split("/")[5];
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          contract_version: "csl_wrapper_decision/v1",
          slot_id: slotId,
          status: "ready",
          fill: true,
          reason: null,
          no_fill_reason: null,
          creative: {
            url: `https://cdn.example.com/${slotId}.png`,
            type: "banner",
            duration_ms: 3000,
            width: 300,
            height: 250,
            mime_type: "image/png",
            click_through_url: "https://example.com/landing",
            sponsor_name: "Bench Sponsor",
          },
          asset_token: `asset_${slotId}`,
          constraints: {
            mode: "banner",
            ruleset_id: "bench_ruleset",
            ruleset_version: 1,
            max_render_delay_ms: 2000,
            require_viewability_ms: 1000,
          },
          cs_declaration: "CS-S (S1/P0)*",
          revenue_estimate: {
            gross_cpm: 1.5,
            estimated_net_per_impression: 0.0012,
            currency: "EUR",
          },
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("sdk_benchmark_server_missing_address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
