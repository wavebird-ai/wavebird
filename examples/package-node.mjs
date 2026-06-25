import { WavebirdClient } from "wavebird";

const wrapperApiKey = process.env.WAVEBIRD_SECRET_KEY;
if (!wrapperApiKey) {
  throw new Error("Set WAVEBIRD_SECRET_KEY before running package-node.mjs");
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
});

const job = await client.createJob({
  job_type: "chat",
  slots_requested: 1,
});

if (!job?.slot_ids[0]) {
  console.error("wavebird job creation returned null.");
} else {
  const decision = await client.getDecision(job.slot_ids[0]);
  console.log(decision);
}
