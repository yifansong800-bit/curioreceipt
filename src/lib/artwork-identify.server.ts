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
  source?: "deepseek";
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
    source: "deepseek",
  };
}

export async function identifyArtworkInternal(data: IdentifyInput): Promise<IdentifyResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("identifyArtwork: DEEPSEEK_API_KEY not configured");
    return emptyIdentify("no-key");
  }

  const museumName = (data.museum ?? "").trim() || "the museum the visitor entered";
  const location = [data.city, data.country].filter(Boolean).join(", ");
  const prompt =
    `Identify the exact artwork title, artist, medium of artwork and date of artwork created for this piece seen at ${museumName}${location ? ` in ${location}` : ""}. ` +
    "Return ONLY a compact JSON object with keys title, artist, year, medium. Use null for any field you cannot identify with high confidence. Do not guess.";

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are an art historian. Respond with a single JSON object only, no prose. Keys: title, artist, year, medium. Use null when unsure.",
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: abort.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      console.error("identifyArtwork: DeepSeek error", response.status, detail);
      return emptyIdentify(`deepseek-${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      console.error("identifyArtwork: DeepSeek empty response");
      return emptyIdentify("empty");
    }
    const parsed = parseJsonObject(text);
    if (!parsed) {
      console.error("identifyArtwork: could not parse DeepSeek JSON", text.slice(0, 300));
      return emptyIdentify("parse-failed");
    }
    return finalize(parsed);
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error("identifyArtwork: DeepSeek call failed", err instanceof Error ? err.message : err);
    }
    return emptyIdentify("network");
  } finally {
    clearTimeout(timeout);
  }
}
