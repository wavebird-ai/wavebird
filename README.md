# Wavebird SDK

Wavebird is ad-tech infrastructure for AI surfaces. It connects AI apps, agents, chat products, copilots, and other generative interfaces to programmatic ad delivery while keeping the developer in control of when ads are requested, where they are rendered, and which events are reported.

The SDK is the package-level integration path for teams that want explicit control over jobs, decisions, rendering helpers, consent state, generation lifecycle events, and beacons. Showing an ad during model waiting or generation time is one supported pattern. It is not the only use case: the SDK can also support server-controlled slots, browser-controlled rendering, callback delivery, custom renderers, and typed access to the public wrapper and SSP contracts.

Wavebird is data-minimizing by design. The standard ad-market path uses reduced delivery signals such as topic category, language, format, publisher metadata, consent, and placement rules. Prompts and chat history are not sent to SSPs, DSPs, advertisers, or other ad partners.

## Install

```bash
npm install wavebird
```

The package is ESM-only and requires Node.js 20 or newer. React rendering helpers are optional peer integrations.

## 3-Minute Quickstart

Set your Wavebird API base and server-side secret key:

```bash
WAVEBIRD_BASE_URL=https://api.wavebird.ai
WAVEBIRD_SECRET_KEY=sk_test_replace_me
```

Create a server-side client:

```ts
import { WavebirdClient } from "wavebird";

const client = new WavebirdClient({
  baseUrl: process.env.WAVEBIRD_BASE_URL ?? "https://api.wavebird.ai",
  getApiKey: () => process.env.WAVEBIRD_SECRET_KEY ?? "",
  decisionDelivery: "polling",
  publisher: {
    app_name: "My AI App",
    app_domain: "example.com",
    categories: ["IAB19"],
  },
});
```

Create a job when your app has an ad opportunity:

```ts
const job = await client.createJob({
  job_type: "chat",
  slots_requested: 1,
  context: {
    topic: "music education",
  },
  consent: {
    gdpr_applies: true,
    semantic_targeting: false,
    prompt_shared: false,
  },
  slot_config: {
    allowed_formats: ["banner", "native"],
    position_hint: "below",
    max_width: 728,
    max_height: 90,
  },
});
```

Fetch a decision for the returned slot:

```ts
const slotId = job?.slot_ids[0];
const decision = slotId ? await client.getDecision(slotId) : null;

if (decision?.fill === true) {
  console.log(decision.creative.url);
}
```

Report generation lifecycle events and delivery beacons when you have them:

```ts
if (job) {
  await client.reportGeneration(job.job_id, "finished", {
    generation_id: "gen_123",
    model_id: "gpt-4o-mini",
  });
}

if (decision?.fill === true) {
  await client.sendBeacon({
    beacon_id: "beacon_123",
    asset_token: decision.asset_token,
    beacon_type: "rendered",
    occurred_at_ms_client: Date.now(),
  });
}
```

## Browser and Rendering Helpers

The browser entry uses publishable keys and browser activation. Do not put secret keys in browser code.

```ts
import { WavebirdClient } from "wavebird/browser";

const browserClient = new WavebirdClient({
  baseUrl: "https://api.wavebird.ai",
  publishableKey: "pk_test_replace_me",
  decisionDelivery: "auto",
  publisher: {
    app_name: "My AI App",
    app_domain: "example.com",
  },
});
```

React and DOM rendering helpers are available when you want Wavebird to mount a returned creative:

```ts
import { WavebirdAd } from "wavebird/react";
import { mountWavebirdAd } from "wavebird/mount";
```

For custom renderers, pass the returned `DecisionResponse` into your own UI and call `sendBeacon()` for rendered, visibility, playback, and click events.

## Public Package Surface

| Import path | What it exposes |
| --- | --- |
| `wavebird` | Node/server `WavebirdClient`, core types, `WavebirdSdkError`, placement and timing helpers |
| `wavebird/browser` | Browser `WavebirdClient` with publishable-key activation |
| `wavebird/react` | React creative renderer component |
| `wavebird/mount` | DOM mounting helper for non-React apps |
| `wavebird/consent` | Consent storage, parsing, and DOM consent dialog helpers |
| `wavebird/consent/react` | React consent dialog component |
| `wavebird/public-contracts` | Public wrapper and SSP contract types and validators |
| `wavebird/public-contracts/wrapper` | Wrapper contract types and validators |
| `wavebird/public-contracts/ssp` | SSP contract types and validators |

Backend/admin observability contracts are intentionally not exported by the public SDK package.

## Configuration

### Server client

```ts
new WavebirdClient({
  baseUrl: "https://api.wavebird.ai",
  getApiKey: () => process.env.WAVEBIRD_SECRET_KEY ?? "",
  decisionDelivery: "auto",
  publisher: {
    app_name: "My AI App",
    app_domain: "example.com",
  },
  options: {
    timeout_ms: 2000,
    decision_timeout_ms: 30000,
    long_poll_wait_ms: 1500,
    short_poll_interval_ms: 250,
    onError: (error) => {
      console.error(error.code, error.message);
    },
  },
});
```

### Browser client

```ts
new WavebirdClient({
  baseUrl: "https://api.wavebird.ai",
  publishableKey: "pk_test_replace_me",
  decisionDelivery: "auto",
  options: {
    origin: "https://app.example.com",
    onError: (error) => {
      console.error(error.code, error.message);
    },
  },
});
```

Supported delivery modes are `auto`, `websocket`, `polling`, and `callback`. Callback delivery requires a `callback_url` in the `createJob()` request.

## Privacy Boundary

`prompt` is optional. If you can provide a reduced topic yourself, prefer `context.topic`. If you choose to provide prompt text, Wavebird uses it only inside the Wavebird middleware path for classification and policy checks before the outbound ad-market request is built. The outbound programmatic request is based on reduced signals such as topic categories, language, publisher metadata, slot configuration, brand-safety controls, and consent. It does not include prompt text or chat history.

## Error Handling

SDK operations are fail-silent by default: network, parse, timeout, and contract errors return `null`, a pending decision, or a fallback beacon result rather than throwing from public methods. Use `options.onError` and `options.logger` to observe failures:

```ts
const client = new WavebirdClient({
  baseUrl: "https://api.wavebird.ai",
  getApiKey: () => process.env.WAVEBIRD_SECRET_KEY ?? "",
  options: {
    onError: (error) => {
      console.error(error.code, error.message, error.cause);
    },
  },
});
```

## Links

- Website: https://wavebird.ai
- API docs: https://wavebird.ai/api
- SDK docs: https://wavebird.ai/sdk
- Repository: https://github.com/wavebird-ai/wavebird
