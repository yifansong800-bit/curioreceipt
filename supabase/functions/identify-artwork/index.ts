// Supabase Edge Function: identify-artwork
//
// Two-stage identification to reduce hallucination without paid grounding:
//   1. Google Vision API — WEB_DETECTION (best-guess labels, web entities,
//      matching page titles) + TEXT_DETECTION (OCR of any wall plaque).
//   2. Gemini 3.6 Flash — reconciles the Vision evidence + museum context +
//      the image itself into a strict JSON answer. Model is instructed to
//      leave any field blank unless directly supported by OCR text OR by
//      web evidence.
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
  pageTitles: string[];
  ocrText: string;
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
          { type: "WEB_DETECTION", maxResults: 10 },
          { type: "TEXT_DETECTION", maxResults: 1 },
        ],
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
        pagesWithMatchingImages?: { pageTitle?: string }[];
      };
      fullTextAnnotation?: { text?: string };
      textAnnotations?: { description?: string }[];
    }[];
  } | null;

  const r = payload?.responses?.[0];
  if (!r) return null;

  const bestGuessLabels = (r.webDetection?.bestGuessLabels ?? [])
    .map((b) => normalize(b.label))
    .filter(Boolean);

  const webEntities = (r.webDetection?.webEntities ?? [])
    .map((e) => ({ description: normalize(e.description), score: typeof e.score === "number" ? e.score : 0 }))
    .filter((e) => e.description && e.score >= 0.5)
    .slice(0, 10);

  const pageTitles = (r.webDetection?.pagesWithMatchingImages ?? [])
    .map((p) => normalize(p.pageTitle))
    .filter(Boolean)
    .slice(0, 10);

  const ocrText = normalize(r.fullTextAnnotation?.text ?? r.textAnnotations?.[0]?.description ?? "");

  return { bestGuessLabels, webEntities, pageTitles, ocrText };
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!geminiKey) {
    console.error("[identify-artwork] Missing GEMINI_API_KEY");
    return json(500, { error: "Missing GEMINI_API_KEY" });
  }
  if (!visionKey) {
    console.error("[identify-artwork] Missing GOOGLE_VISION_API_KEY");
    return json(500, { error: "Missing GOOGLE_VISION_API_KEY" });
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
  });

  // Stage 1 — Google Vision evidence
  const evidence = await callVision(visionKey, imageBase64);
  console.log("[identify-artwork] VISION_EVIDENCE", JSON.stringify(evidence));

  const hasEvidence = !!evidence && (
    evidence.bestGuessLabels.length > 0 ||
    evidence.webEntities.length > 0 ||
    evidence.pageTitles.length > 0 ||
    evidence.ocrText.length > 0
  );

  if (!hasEvidence) {
    // No web matches AND no plaque text — Gemini would be pure guessing.
    const out = {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK, confident: false,
    };
    console.log("[identify-artwork] SHORT_CIRCUIT no evidence", out);
    console.log("[identify-artwork] DURATION_MS", Date.now() - startedAt);
    return json(200, out);
  }

  const evidenceBlock = [
    `PLAQUE OCR (verbatim text detected on/near the artwork):\n${evidence!.ocrText || "(none)"}`,
    `BEST-GUESS LABELS (from reverse image search):\n${evidence!.bestGuessLabels.join(" | ") || "(none)"}`,
    `WEB ENTITIES (Google Vision, description : score):\n${
      evidence!.webEntities.map((e) => `- ${e.description} : ${e.score.toFixed(2)}`).join("\n") || "(none)"
    }`,
    `MATCHING PAGE TITLES (pages hosting this exact image):\n${
      evidence!.pageTitles.map((t) => `- ${t}`).join("\n") || "(none)"
    }`,
  ].join("\n\n");

  const systemPrompt = `You are an expert museum curator identifying an artwork from a photo.

WHERE IT'S SEEN:
- Museum / Venue Location: ${museumContext}

EVIDENCE FROM GOOGLE VISION (this is your grounding — do not go beyond it):
${evidenceBlock}

CRITICAL ACCURACY RULES:
1. OCR PLAQUE FIRST: If PLAQUE OCR contains an artwork title, artist, date, or medium, treat that as the highest-confidence source and copy it verbatim (fix obvious OCR typos only).
2. USE WEB EVIDENCE: Cross-reference best-guess labels, web entities, and page titles. A field is only valid if at least one of these evidence sources supports it. Prefer matches that are consistent with the Museum / Venue Location — this disambiguates similar works by the same artist (e.g. Yue Minjun's "2000 A.D." at M+ vs "Contemporary Terracotta Warriors" at Donum Estate).
3. NO GUESSING FROM STYLE ALONE: If the artist is famous but the evidence does not name THIS specific work, leave title/year/medium blank. Do not invent plausible values. Do not approximate the year ("circa 2000") — either the evidence gives a specific year or leave it blank.
4. Each field is independent — a confident artist with unknown title is fine (return artist filled, title empty).
5. Return strictly JSON with keys: title, artist, year, medium, confidence.
   - confidence is a boolean: true ONLY if BOTH title AND artist are directly supported by the evidence.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Identify this artwork using the evidence in the system prompt. Return only JSON." },
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
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  const rawText = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
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
