type IdentifyInput = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  museum?: string;
  city?: string | null;
  country?: string | null;
};

type IdentifyResult = {
  confident: boolean;
  title: string | null;
  artist: string | null;
  year: string | null;
  medium: string | null;
  source?: "lovable-ai";
  reason?: string;
};

const emptyIdentify = (reason?: string): IdentifyResult => ({
  confident: false,
  title: null,
  artist: null,
  year: null,
  medium: null,
  reason,
});

function cleanField(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  if (!cleaned || /^(null|unknown|n\/a|none|not available|not sure|unspecified)$/i.test(cleaned)) return null;
  return cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const source = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function finalize(fields: Record<string, unknown>): IdentifyResult {
  const title = cleanField(fields.title, 140);
  const artist = cleanField(fields.artist, 140);
  const year = cleanField(fields.year, 40);
  const medium = cleanField(fields.medium, 120);
  return {
    confident: Boolean(title && (artist || year || medium)),
    title,
    artist,
    year,
    medium,
    source: "lovable-ai",
  };
}

export async function identifyArtworkInternal(data: IdentifyInput): Promise<IdentifyResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("identifyArtwork: OPENROUTER_API_KEY not configured");
    return emptyIdentify("no-key");
  }

  const museumName = (data.museum ?? "").trim() || "the museum the visitor entered";
  const location = [data.city, data.country].filter(Boolean).join(", ");
  const prompt =
    `Identify the exact artwork title, artist, medium of artwork and date the artwork was created for this piece seen at ${museumName}${location ? ` in ${location}` : ""}. ` +
    "Use the image itself as primary evidence, plus the museum context. Do NOT use a museum website title, exhibition title, or collection page title as the artwork title. " +
    "Return ONLY a compact JSON object with keys title, artist, year, medium. Use null for any field you cannot identify with high confidence — do not guess.";

  // Free OpenRouter vision models, tried in order.
  const models = [
    "google/gemma-4-31b-it:free",
    "google/gemma-4-26b-a4b-it:free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
  ];

  for (const model of models) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 30000);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://curioreceipt.com",
          "X-Title": "Curio",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are an expert art historian and museum curator. Identify artworks precisely from visual evidence. Respond with a single JSON object only: keys title, artist, year, medium. Use null when you cannot identify with high confidence. Never guess.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
                },
              ],
            },
          ],
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1000);
        console.error("identifyArtwork: gateway error", model, response.status, detail);
        if (response.status === 429 || response.status === 402) return emptyIdentify(`gateway-${response.status}`);
        continue;
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      if (!text.trim()) {
        console.error("identifyArtwork: empty response from", model);
        continue;
      }
      const parsed = parseJsonObject(text);
      if (!parsed) {
        console.error("identifyArtwork: could not parse JSON from", model, text.slice(0, 300));
        continue;
      }
      const result = finalize(parsed);
      if (result.title || result.artist || result.year || result.medium) return result;
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error("identifyArtwork: call failed", model, err instanceof Error ? err.message : err);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return emptyIdentify("not-found");
}
