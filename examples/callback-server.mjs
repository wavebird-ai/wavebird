import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";
import { WavebirdClient } from "wavebird";

function signCallbackPayload(payload, secret) {
  return `sha256=${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`;
}

function hasValidSignature({ payload, signature, secret }) {
  if (!signature) {
    return false;
  }
  const expected = Buffer.from(signCallbackPayload(payload, secret), "utf8");
  const received = Buffer.from(signature.trim(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function main() {
  const baseUrl = process.env.WAVEBIRD_BASE_URL ?? "https://api.wavebird.ai";
  const wrapperApiKey = process.env.WAVEBIRD_SECRET_KEY;
  const callbackPort = Number(process.env.WAVEBIRD_CALLBACK_PORT ?? "4011");

  if (!wrapperApiKey) {
    throw new Error("Set WAVEBIRD_SECRET_KEY before running callback-server.mjs");
  }

  const callbackServer = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      const payload = Buffer.concat(chunks).toString("utf8");
      const signature = typeof req.headers["x-csl-signature"] === "string" ? req.headers["x-csl-signature"] : null;
      const valid = hasValidSignature({
        payload,
        signature,
        secret: wrapperApiKey,
      });
      process.stdout.write(`Callback valid=${String(valid)} payload=${payload}\n`);
      res.statusCode = valid ? 200 : 401;
      res.end(valid ? "ok" : "invalid signature");
    });
  });

  await new Promise((resolve) => callbackServer.listen(callbackPort, "127.0.0.1", resolve));

  try {
    const client = new WavebirdClient({
      baseUrl,
      getApiKey: () => wrapperApiKey,
      publisher: {
        app_name: "MyAIChatApp",
        app_domain: "mychatapp.com",
        categories: ["IAB19"],
      },
      decisionDelivery: "callback",
      options: {
        timeout_ms: 3_000,
        decision_timeout_ms: 8_000,
        wrapper_version: "package-callback-example",
      },
    });

    const job = await client.createJob({
      job_type: "chat",
      predicted_latency_ms: 4_000,
      context: {
        topic: "travel",
      },
      slots_requested: 1,
      routing: {
        preferred_partner_id: "ssp_local_1",
        candidate_partner_ids: ["ssp_local_1"],
      },
      callback_url: `http://127.0.0.1:${String(callbackPort)}/decision`,
    });

    process.stdout.write(`Created callback job: ${JSON.stringify(job)}\n`);
    process.stdout.write("Keep this process running until wavebird delivers the decision callback.\n");
  } catch (error) {
    process.stderr.write(`Callback example failed: ${String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
