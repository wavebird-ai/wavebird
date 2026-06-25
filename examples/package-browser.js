import { WavebirdClient } from "wavebird/browser";

const env = typeof process !== "undefined" && process.env ? process.env : {};
const apiKey = env.WAVEBIRD_SECRET_KEY ?? "";

if (!apiKey) {
  console.warn("Set WAVEBIRD_SECRET_KEY before running package-browser.js.");
}

const client = new WavebirdClient({
  baseUrl: env.WAVEBIRD_BASE_URL ?? "https://api.wavebird.ai",
  getApiKey: () => apiKey,
  publisher: {
    app_name: "MyAIChatApp",
    app_domain: "mychatapp.com",
    categories: ["IAB19"],
  },
  decisionDelivery: "auto",
});

const job = await client.createJob({
  job_type: "chat",
  slots_requested: 1,
});

if (job?.slot_ids[0]) {
  const decision = await client.getDecision(job.slot_ids[0]);
  console.log(decision);
}
