type ProxyMetadata = {
  job_id: string;
  slot_ids: string[];
  decision_mode: string;
  decision_path?: string;
};

type AnthropicMessagesResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  csl?: ProxyMetadata;
};

function extractAnthropicText(body: AnthropicMessagesResponse): string | null {
  if (!Array.isArray(body.content)) {
    return null;
  }
  return body.content
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function main(): Promise<void> {
  const baseUrl = process.env.WAVEBIRD_BASE_URL ?? "https://api.wavebird.ai";
  const wrapperApiKey = process.env.WAVEBIRD_SECRET_KEY;
  if (!wrapperApiKey) {
    throw new Error("Set WAVEBIRD_SECRET_KEY before running proxy-anthropic-server.ts");
  }

  const response = await fetch(`${baseUrl}/v1/proxy/anthropic/v1/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${wrapperApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: "I want a travel deal for a weekend trip.",
        },
      ],
      csl: {
        locale: "en-US",
        job_type: "chat",
        predicted_latency_ms: 4_000,
        consent: {
          semantic_targeting: true,
          session_persistence: false,
          cross_session_persistence: false,
        },
        slots_requested: 1,
        routing: {
          preferred_partner_id: "ssp_local_1",
          candidate_partner_ids: ["ssp_local_1", "ssp_backup_1"],
        },
      },
    }),
  });

  const body = (await response.json()) as AnthropicMessagesResponse | Record<string, unknown>;
  if (!response.ok) {
    process.stderr.write(`Wavebird proxy request failed with ${response.status}\n`);
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        text: extractAnthropicText(body as AnthropicMessagesResponse),
        csl: (body as AnthropicMessagesResponse).csl ?? null,
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error) => {
  process.stderr.write(`proxy-anthropic-server failed: ${String(error)}\n`);
  process.exitCode = 1;
});

