// Supabase Edge Function: identify-artwork
//
// Two-stage identification (no paid Search Grounding required):
//   1. Google Vision — WEB_DETECTION (best-guess labels, web entities, matching
//      page titles) + TEXT_DETECTION (wall-plaque OCR). Used as HINTS.
//   2. Gemini flash — looks at the photo itself, uses the Vision hints and the
//      museum context to disambiguate, and may also use its own art-historical
//      knowledge. Vision is a tie-breaker, never a gate.
//
// Body: { imageBase64, mimeType?, museumContext?, museum?, city?, country? }
// Response: { title, artist, year, medium, confident }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK = "couldn't identify, enter manually";
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

interface RequestBody {
  imageBase64?: string;
  mimeType?: string;
  museumContext?: string;
  museum?: string;
  city?: string;
  country?: string;
}

interface VisionEvidence {
  bestGuessLabels: string[];
  webEntities: { description: string; score: number }[];
  pages: { title: string; url: string }[];
  fullMatchUrls: string[];
  partialMatchUrls: string[];
  ocrText: string;
}

function urlHint(url: string): string {
  try {
    const u = new URL(url);
    const slug = decodeURIComponent(u.pathname)
      .replace(/\.(html?|php|aspx?|jpe?g|png|webp)$/i, "")
      .split("/")
      .filter(Boolean)
      .slice(-2)
      .join(" / ")
      .replace(/[-_+]+/g, " ")
      .trim();
    return slug ? `${u.hostname} — ${slug}` : u.hostname;
  } catch {
    return url;
  }
}

function normalize(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  if (/^(unknown|n\/?a|none|null|not (specified|available|known))$/i.test(s)) return "";
  return s;
}

function coerceConfident(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v >= 0.7;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "high", "confident", "yes"].includes(s)) return true;
    const n = Number(s);
    if (!Number.isNaN(n)) return n >= 0.7;
  }
  return false;
}

function extractJson(text: string): string | null {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

async function callVision(apiKey: string, imageBase64: string): Promise<VisionEvidence | null> {
  const body = {
    requests: [
      {
        image: { content: imageBase64 },
        features: [
          { type: "WEB_DETECTION", maxResults: 25 },
          { type: "TEXT_DETECTION", maxResults: 1 },
        ],
        imageContext: { webDetectionParams: { includeGeoResults: true } },
      },
    ],
  };

  let resp: Response;
  try {
    resp = await fetch(`${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[identify-artwork] VISION_FETCH_THREW", err);
    return null;
  }

  console.log("[identify-artwork] VISION_STATUS", resp.status, resp.statusText);
  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[identify-artwork] VISION_ERROR_BODY", errText);
    return null;
  }

  const payload = await resp.json().catch(() => null) as {
    responses?: {
      webDetection?: {
        bestGuessLabels?: { label?: string }[];
        webEntities?: { description?: string; score?: number }[];
        pagesWithMatchingImages?: { pageTitle?: string; url?: string }[];
        fullMatchingImages?: { url?: string }[];
        partialMatchingImages?: { url?: string }[];
        visuallySimilarImages?: { url?: string }[];
      };
      fullTextAnnotation?: { text?: string };
      textAnnotations?: { description?: string }[];
      error?: unknown;
    }[];
  } | null;

  const r = payload?.responses?.[0];
  if (!r) return null;
  if (r.error) console.error("[identify-artwork] VISION_RESPONSE_ERROR", JSON.stringify(r.error));

  const bestGuessLabels = (r.webDetection?.bestGuessLabels ?? [])
    .map((b) => normalize(b.label))
    .filter(Boolean);

  // Keep low-score entities too — they are hints, not proof.
  const webEntities = (r.webDetection?.webEntities ?? [])
    .map((e) => ({ description: normalize(e.description), score: typeof e.score === "number" ? e.score : 0 }))
    .filter((e) => e.description)
    .slice(0, 20);

  const pages = (r.webDetection?.pagesWithMatchingImages ?? [])
    .map((p) => ({ title: normalize(p.pageTitle), url: normalize(p.url) }))
    .filter((p) => p.title || p.url)
    .slice(0, 15);

  const fullMatchUrls = (r.webDetection?.fullMatchingImages ?? [])
    .map((i) => normalize(i.url))
    .filter(Boolean)
    .slice(0, 15);

  const partialMatchUrls = [
    ...(r.webDetection?.partialMatchingImages ?? []),
    ...(r.webDetection?.visuallySimilarImages ?? []),
  ]
    .map((i) => normalize(i.url))
    .filter(Boolean)
    .slice(0, 15);

  const ocrText = normalize(r.fullTextAnnotation?.text ?? r.textAnnotations?.[0]?.description ?? "");

  return { bestGuessLabels, webEntities, pages, fullMatchUrls, partialMatchUrls, ocrText };
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const visionKey = Deno.env.get("VISION_API_KEY")
    ?? Deno.env.get("GOOGLE_VISION_API_KEY")
    ?? Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    console.error("[identify-artwork] Missing GEMINI_API_KEY");
    return json(500, { error: "Missing GEMINI_API_KEY" });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const imageBase64 = body.imageBase64;
  const mimeType = body.mimeType || "image/jpeg";
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return json(400, { error: "imageBase64 is required" });
  }

  const explicitContext = normalize(body.museumContext);
  const museum = normalize(body.museum);
  const city = normalize(body.city);
  const country = normalize(body.country);
  const derivedContext = [museum, city, country].filter(Boolean).join(", ");
  const museumContext = explicitContext || derivedContext || "Unknown / Unspecified";

  console.log("[identify-artwork] REQUEST", {
    timestamp: new Date().toISOString(),
    museumContext,
    imageBytes: imageBase64.length,
    mimeType,
    visionKeyPresent: Boolean(visionKey),
  });

  // Stage 1 — Vision hints (best-effort; never blocks identification)
  const evidence = visionKey ? await callVision(visionKey, imageBase64) : null;
  console.log("[identify-artwork] VISION_EVIDENCE", JSON.stringify(evidence));

  const evidenceBlock = evidence
    ? [
        `PLAQUE OCR (verbatim text detected in the photo):\n${evidence.ocrText || "(none)"}`,
        `REVERSE-IMAGE BEST GUESS:\n${evidence.bestGuessLabels.join(" | ") || "(none)"}`,
        `WEB ENTITIES (description : score):\n${
          evidence.webEntities.map((e) => `- ${e.description} : ${e.score.toFixed(2)}`).join("\n") || "(none)"
        }`,
        `PAGE TITLES HOSTING A MATCHING IMAGE:\n${
          evidence.pageTitles.map((t) => `- ${t}`).join("\n") || "(none)"
        }`,
      ].join("\n\n")
    : "(reverse image search unavailable for this request)";

  const systemPrompt = `You are an expert museum curator and art historian identifying an artwork from a visitor's photo.

WHERE IT'S SEEN:
- Museum / Venue Location: ${museumContext}

REVERSE-IMAGE SEARCH HINTS (from Google Vision — helpful but incomplete; phone photos often return generic or noisy matches):
${evidenceBlock}

HOW TO USE THE SOURCES, IN PRIORITY ORDER:
1. PLAQUE OCR: if the photo's OCR text contains a title, artist, date, or medium, copy it verbatim (fix only obvious OCR typos). This outranks everything else.
2. REVERSE-IMAGE HINTS: use page titles / best-guess labels / entities to pin down the exact work, especially to disambiguate similar works by the same artist (e.g. Yue Minjun's "2000 A.D." at M+ vs "Contemporary Terracotta Warriors" at Donum Estate). Ignore hints that are generic ("sculpture", "art museum") or clearly about a different work.
3. YOUR OWN KNOWLEDGE: if the hints are empty or unhelpful but you genuinely recognise this specific work from the image and the museum context, you SHOULD fill the fields from your own knowledge. Empty hints are NOT a reason to return blanks.

ACCURACY RULES:
- Never invent a plausible-sounding title just because you recognise the artist or style. If you cannot name the specific work, leave title blank but still return the artist.
- Never approximate the year ("circa 2000", "2000s") — give a specific year or leave it blank.
- Each field is independent; partial answers are expected and useful.
- Medium: use the catalogue wording if known (e.g. "acrylic on polyester and fiberglass"), otherwise leave blank.
- Return strictly JSON with keys: title, artist, year, medium, confidence.
  - confidence is a boolean: true only if BOTH title AND artist are supported by the plaque OCR, the reverse-image hints, or unambiguous first-hand recognition of this exact work.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Identify this artwork using the rules in the system prompt. Return only JSON. Fill every field you can support; leave a field as an empty string only when you truly cannot support it." },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    systemInstruction: {
      role: "system",
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0,
      topP: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          artist: { type: "STRING" },
          year: { type: "STRING" },
          medium: { type: "STRING" },
          confidence: { type: "BOOLEAN" },
        },
        required: ["title", "artist", "year", "medium", "confidence"],
      },
    },
  };

  console.log("[identify-artwork] GEMINI_REQUEST", {
    endpoint: GEMINI_ENDPOINT,
    model: GEMINI_MODEL,
    temperature: 0,
    topP: 0.1,
    systemPromptChars: systemPrompt.length,
    hasVisionHints: Boolean(evidence),
  });

  let resp: Response;
  try {
    resp = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    console.error("[identify-artwork] GEMINI_FETCH_THREW", err);
    console.log("[identify-artwork] DURATION_MS", Date.now() - startedAt);
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK, confident: false,
    });
  }

  console.log("[identify-artwork] GEMINI_STATUS", resp.status, resp.statusText);

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("[identify-artwork] GEMINI_ERROR_BODY", errText);
    console.log("[identify-artwork] DURATION_MS", Date.now() - startedAt);
    if (resp.status === 429) return json(429, { error: "Rate limit exceeded, please try again shortly." });
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK, confident: false,
    });
  }

  const payload = await resp.json().catch(() => null) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  } | null;

  const rawText = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  console.log("[identify-artwork] GEMINI_FINISH_REASON", payload?.candidates?.[0]?.finishReason ?? "(none)");
  console.log("[identify-artwork] GEMINI_RAW_TEXT", rawText);

  let parsed: { title?: string; artist?: string; year?: string; medium?: string; confidence?: unknown; confident?: unknown } = {};
  const jsonSlice = extractJson(rawText);
  if (jsonSlice) {
    try {
      parsed = JSON.parse(jsonSlice);
      console.log("[identify-artwork] PARSE_OK", parsed);
    } catch (err) {
      console.error("[identify-artwork] PARSE_FAIL", err, jsonSlice);
    }
  } else {
    console.error("[identify-artwork] PARSE_FAIL no JSON object found");
  }

  const title = normalize(parsed.title);
  const artist = normalize(parsed.artist);
  const year = normalize(parsed.year);
  const medium = normalize(parsed.medium);
  const modelConfident = coerceConfident(parsed.confidence ?? parsed.confident);

  if (!(title || artist || year || medium)) {
    const out = {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK, confident: false,
    };
    console.log("[identify-artwork] FINAL", out);
    console.log("[identify-artwork] DURATION_MS", Date.now() - startedAt);
    return json(200, out);
  }

  const out = {
    title: title || FALLBACK,
    artist: artist || FALLBACK,
    year: year || FALLBACK,
    medium: medium || FALLBACK,
    confident: modelConfident && Boolean(title) && Boolean(artist),
  };
  console.log("[identify-artwork] FINAL", out);
  console.log("[identify-artwork] DURATION_MS", Date.now() - startedAt);
  return json(200, out);
});
