type ProxyMetadata = {
  job_id: string;
  slot_ids: string[];
  decision_mode: string;
  decision_path?: string;
};

type OpenAiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  csl?: ProxyMetadata;
};

function extractOpenAiText(body: OpenAiChatResponse): string | null {
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function main(): Promise<void> {
  const baseUrl = process.env.WAVEBIRD_BASE_URL ?? "https://api.wavebird.ai";
  const wrapperApiKey = process.env.WAVEBIRD_SECRET_KEY;
  if (!wrapperApiKey) {
    throw new Error("Set WAVEBIRD_SECRET_KEY before running proxy-openai-server.ts");
  }

  const response = await fetch(`${baseUrl}/v1/proxy/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${wrapperApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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

  const body = (await response.json()) as OpenAiChatResponse | Record<string, unknown>;
  if (!response.ok) {
    process.stderr.write(`Wavebird proxy request failed with ${response.status}\n`);
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        text: extractOpenAiText(body as OpenAiChatResponse),
        csl: (body as OpenAiChatResponse).csl ?? null,
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error) => {
  process.stderr.write(`proxy-openai-server failed: ${String(error)}\n`);
  process.exitCode = 1;
});

