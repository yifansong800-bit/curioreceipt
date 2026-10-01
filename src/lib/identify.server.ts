// Artwork identification via Lovable AI Gateway (OpenAI Responses, streamed).

export type IdentifyOut = {
  title: string;
  artist: string;
  year: string;
  medium: string;
  confident: boolean;
};

const MODEL = "openai/gpt-6-astra";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "artist", "year", "medium", "confident"],
  properties: {
    title: { type: "string" },
    artist: { type: "string" },
    year: { type: "string" },
    medium: { type: "string" },
    confident: { type: "boolean" },
  },
};

function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (/^(unknown|n\/?a|none|null|not (specified|available|known))?$/i.test(s)) return "";
  return s;
}

export async function identifyArtwork(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  museumContext: string,
): Promise<IdentifyOut> {
  const instructions = `You are an expert museum curator and art historian identifying an artwork from a visitor's phone photo.
Venue: ${museumContext || "unknown"}.
Rules:
- Look closely at the image. If a wall label/plaque is visible, read it and trust it above all else.
- Use your art-historical knowledge plus the venue's collection to name the specific work.
- Never invent a title just because you recognise the style; if unsure of the exact work, leave title "" but still give the artist if you can.
- Year: a specific year or range as catalogued (e.g. "1928" or "1503–1519"); never vague.
- Medium: catalogue wording (e.g. "Oil on canvas").
- confident = true only if you clearly recognise this exact work (or read it on a label).
Return empty strings for anything you cannot support.`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Identify this artwork." },
            { type: "input_image", image_url: `data:${mimeType};base64,${imageBase64}` },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "artwork", strict: true, schema: SCHEMA } },
      reasoning: { effort: "low" },
      stream: true,
      store: false,
    }),
  });

  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    console.error("[identify] gateway error", resp.status, t.slice(0, 500));
    throw new Error(`gateway ${resp.status}`);
  }

  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let refused = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") refused = true;
          else if (ev.type === "error" || ev.type === "response.failed") {
            console.error("[identify] stream error", data.slice(0, 500));
          }
        } catch {
          /* partial */
        }
      }
    }
  }

  if (refused || !text) return { title: "", artist: "", year: "", medium: "", confident: false };
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("[identify] parse fail", text.slice(0, 300));
  }
  const title = clean(parsed.title);
  const artist = clean(parsed.artist);
  return {
    title,
    artist,
    year: clean(parsed.year),
    medium: clean(parsed.medium),
    confident: parsed.confident === true && Boolean(title && artist),
  };
}
