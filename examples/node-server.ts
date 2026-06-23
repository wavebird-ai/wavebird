import { WavebirdClient } from "wavebird";

async function main(): Promise<void> {
  const wrapperApiKey = process.env.WAVEBIRD_SECRET_KEY;
  if (!wrapperApiKey) {
    throw new Error("Set WAVEBIRD_SECRET_KEY before running node-server.ts");
  }

  const client = new WavebirdClient({
    baseUrl: process.env.WAVEBIRD_BASE_URL ?? "https://api.wavebird.ai",
    getApiKey: () => wrapperApiKey,
    publisher: {
      app_name: "MyAIChatApp",
      app_domain: "mychatapp.com",
      categories: ["IAB19"],
    },
    decisionDelivery: "polling",
    options: {
      timeout_ms: 2_500,
      decision_timeout_ms: 10_000,
      long_poll_wait_ms: 1_500,
      onError: (error) => {
        process.stderr.write(`Wavebird SDK fail-silent error: ${String(error)}\n`);
      },
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
  });

  if (!job) {
    process.stderr.write("Wavebird job creation returned null.\n");
    return;
  }
  if ("retry_after_ms" in job) {
    process.stderr.write(`Wavebird job creation was rate limited. Retry after ${job.retry_after_ms}ms.\n`);
    return;
  }

  await client.reportGeneration(job.job_id, "started", {
    generation_id: `gen_${job.job_id}`,
    model_id: "gpt-4o-mini",
  });

  const decision = await client.getDecision(job.slot_ids[0]!);
  await client.reportGeneration(job.job_id, "finished", {
    generation_id: `gen_${job.job_id}`,
    model_id: "gpt-4o-mini",
  });

  process.stdout.write(`Decision:\n${JSON.stringify(decision, null, 2)}\n`);
  if (decision.fill !== true) {
    return;
  }

  const beaconBase = {
    asset_token: decision.asset_token,
    occurred_at_ms_client: Date.now(),
  };
  await client.sendBeacon({
    beacon_id: `rendered-${Date.now()}`,
    beacon_type: "rendered",
    ...beaconBase,
  });
  await client.sendBeacon({
    beacon_id: `visible-started-${Date.now()}`,
    beacon_type: "visible_started",
    ...beaconBase,
  });
  await client.sendBeacon({
    beacon_id: `heartbeat-${Date.now()}`,
    beacon_type: "heartbeat",
    ...beaconBase,
    measurements: { percent: 100 },
  });

  if (decision.creative.type === "clip") {
    await client.sendBeacon({
      beacon_id: `play-completed-${Date.now()}`,
      beacon_type: "play_completed",
      ...beaconBase,
    });
  } else {
    await client.sendBeacon({
      beacon_id: `visible-ended-${Date.now()}`,
      beacon_type: "visible_ended",
      ...beaconBase,
    });
  }
}

void main();

