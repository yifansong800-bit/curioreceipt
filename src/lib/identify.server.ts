// Artwork identification via Anthropic Claude (direct Messages API),
// with optional Google Vision hints (plaque OCR + reverse-image web detection).

export type IdentifyOut = {
  title: string;
  artist: string;
  year: string;
  medium: string;
  confident: boolean;
};

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

const EMPTY: IdentifyOut = { title: "", artist: "", year: "", medium: "", confident: false };

function clean(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (/^(unknown|n\/?a|none|null|not (specified|available|known))?$/i.test(s)) return "";
  return s;
}

async function visionHints(visionKey: string, imageBase64: string): Promise<string> {
  try {
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(visionKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [
                { type: "WEB_DETECTION", maxResults: 10 },
                { type: "TEXT_DETECTION", maxResults: 1 },
              ],
            },
          ],
        }),
      },
    );
    if (!resp.ok) {
      console.error("[identify] vision error", resp.status);
      return "";
    }
    const j = (await resp.json()) as {
      responses?: {
        fullTextAnnotation?: { text?: string };
        webDetection?: {
          bestGuessLabels?: { label?: string }[];
          webEntities?: { description?: string; score?: number }[];
          pagesWithMatchingImages?: { pageTitle?: string; url?: string }[];
        };
      }[];
    };
    const r = j.responses?.[0];
    const wd = r?.webDetection;
    const ocr = (r?.fullTextAnnotation?.text ?? "").slice(0, 800);
    const best = (wd?.bestGuessLabels ?? []).map((b) => b.label).filter(Boolean).join(" | ");
    const ents = (wd?.webEntities ?? [])
      .filter((e) => e.description)
      .slice(0, 10)
      .map((e) => `- ${e.description} (${(e.score ?? 0).toFixed(2)})`)
      .join("\n");
    const pages = (wd?.pagesWithMatchingImages ?? [])
      .slice(0, 8)
      .map((p) => `- ${(p.pageTitle ?? "").replace(/<[^>]+>/g, "")} — ${p.url ?? ""}`)
      .join("\n");
    return [
      `PLAQUE OCR:\n${ocr || "(none)"}`,
      `REVERSE-IMAGE BEST GUESS:\n${best || "(none)"}`,
      `WEB ENTITIES:\n${ents || "(none)"}`,
      `PAGES WITH MATCHING IMAGE:\n${pages || "(none)"}`,
    ].join("\n\n");
  } catch (e) {
    console.error("[identify] vision threw", e);
    return "";
  }
}

export async function identifyArtwork(
    geminiKey: string,
  visionKey: string | undefined,
  imageBase64: string,
  mimeType: string,
  museumContext: string,
): Promise<IdentifyOut> {
  const hints = visionKey ? await visionHints(visionKey, imageBase64) : "";

  const systemPrompt = `You are an expert museum curator and art historian identifying an artwork from a visitor's phone photo.
Venue: ${museumContext || "unknown"}.

REVERSE-IMAGE / OCR EVIDENCE (helpful but noisy):
${hints || "(unavailable)"}

Rules:
- Look at the photo first. If a wall label is visible (or in the OCR), trust it above all else.
- Accept a web-evidence candidate only if it matches what you actually see and fits the venue.
- If evidence is empty but you genuinely recognise this exact work, use your own knowledge.
- Never invent a title just because you recognise the artist/style; leave title "" but still give the artist.
- Year: a specific year or catalogued range (e.g. "1928", "1503–1519"); never vague.
- Medium: catalogue wording (e.g. "Oil on canvas").
- confident = true only if title AND artist are clearly supported.
Return empty strings for anything you cannot support.`;

  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: "Identify this artwork. Return only JSON." },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            artist: { type: "STRING" },
            year: { type: "STRING" },
            medium: { type: "STRING" },
            confident: { type: "BOOLEAN" },
          },
          required: ["title", "artist", "year", "medium", "confident"],
        },
      },
    }),
  };
  let resp: Response | null = null;
  for (const m of GEMINI_MODELS) {
    resp = await fetch(`${endpoint(m)}?key=${encodeURIComponent(geminiKey)}`, init);
    if (resp.ok) break;
    const t = await resp.text().catch(() => "");
    console.error("[identify] gemini error", m, resp.status, t.slice(0, 300));
    if (![404, 429, 500, 503].includes(resp.status)) throw new Error(`gemini ${resp.status}`);
  }
  if (!resp || !resp.ok) throw new Error("gemini unavailable");

  const payload = (await resp.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) return EMPTY;

  let parsed: Record<string, unknown> = {};
  try {
    const m = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : text);
  } catch {
    console.error("[identify] parse fail", text.slice(0, 300));
    return EMPTY;
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
