import { WavebirdClient } from "wavebird";
import type { ConsentFlags, DecisionResponse, JobRequest } from "wavebird";

type ExpressLikeRequest = {
  body?: {
    prompt?: string;
    locale?: string;
    model_id?: string;
    consent?: ConsentFlags;
  };
};

type ExpressLikeResponse = {
  locals: Record<string, unknown>;
  on: (event: "finish", handler: () => void) => void;
};

type NextFunction = () => void;

export type CslMiddlewareState = {
  job_id: string | null;
  slot_id: string | null;
  decision: DecisionResponse | null;
};

export function createCslExpressMiddleware(config: {
  baseUrl: string;
  apiKey: string;
  createJobRequest?: (req: ExpressLikeRequest) => JobRequest;
}) {
  const client = new WavebirdClient({
    baseUrl: config.baseUrl,
    getApiKey: () => config.apiKey,
    decisionDelivery: "auto",
  });

  return async function cslMiddleware(
    req: ExpressLikeRequest,
    res: ExpressLikeResponse,
    next: NextFunction
  ): Promise<void> {
    const request =
      config.createJobRequest?.(req) ??
      ({
        job_type: "chat",
        model_id: req.body?.model_id ?? "gpt-4o-mini",
        locale: req.body?.locale ?? "en-US",
        predicted_latency_ms: 4_000,
        consent:
          req.body?.consent ?? {
            semantic_targeting: true,
            session_persistence: false,
            cross_session_persistence: false,
          },
        prompt: {
          text: req.body?.prompt ?? "",
        },
        slots_requested: 1,
        routing: {
          preferred_partner_id: "ssp_local_1",
          candidate_partner_ids: ["ssp_local_1"],
        },
      } satisfies JobRequest);

    const job = await client.createJob(request);
    let decision: DecisionResponse | null = null;

    const acceptedJob = job && !("retry_after_ms" in job) ? job : null;

    if (acceptedJob?.slot_ids[0]) {
      await client.reportGeneration(acceptedJob.job_id, "started", {
        generation_id: `gen_${acceptedJob.job_id}`,
        model_id: request.model_id,
      });
      decision = await client.getDecision(acceptedJob.slot_ids[0]);
      await client.reportGeneration(acceptedJob.job_id, "finished", {
        generation_id: `gen_${acceptedJob.job_id}`,
        model_id: request.model_id,
      });
    }

    const state: CslMiddlewareState = {
      job_id: acceptedJob?.job_id ?? null,
      slot_id: acceptedJob?.slot_ids[0] ?? null,
      decision,
    };
    res.locals.csl = state;

    res.on("finish", () => {
      if (!decision || decision.fill !== true) {
        return;
      }
      void client.sendBeacon({
        beacon_id: `rendered-${Date.now()}`,
        asset_token: decision.asset_token,
        beacon_type: "rendered",
        occurred_at_ms_client: Date.now(),
      });
    });

    next();
  };
}
