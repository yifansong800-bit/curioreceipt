// Supabase Edge Function: identify-artwork
//
// Uses Gemini with Google Search grounding to identify an artwork from a photo
// plus optional museum context. Search grounding requires a billed Google AI
// Studio project (free tier blocks the tool).
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

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
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
  });

  const systemPrompt = `You are an expert museum curator and art historian. Analyze the provided image to identify the exact artwork.

WHERE IT'S SEEN:
- Museum / Venue Location: ${museumContext}

CRITICAL ACCURACY RULES:
1. OCR & PLAQUE FIRST: Check for any visible exhibition text, wall plaques, artist signatures, or labels. Prioritize exact text over general visual pattern matching.
2. DISAMBIGUATE WITH USER CONTEXT: Use the provided Museum / Venue Location to narrow down artwork titles when an artist has created multiple similar-looking series or installations (e.g., Yue Minjun's "2000 A.D." at M+ Museum vs. "Contemporary Terracotta Warriors" at Donum Estate).
3. USE GOOGLE SEARCH: Verify the visual details and location context against live web/catalog search results before confirming the title.
4. Each field is independent — a confident artist with unknown title is fine (return artist filled, title empty). Do not invent plausible values. Do not approximate the year ("circa 2000") — either evidence gives a specific year or leave it blank.
5. Return strictly JSON with keys: title, artist, year, medium, confidence.
   - confidence is a boolean: true ONLY if BOTH title AND artist are directly supported by evidence.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Identify this artwork using the rules in the system prompt. Return only JSON." },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    systemInstruction: {
      role: "system",
      parts: [{ text: systemPrompt }],
    },
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0,
      topP: 0.1,
    },
  };

  console.log("[identify-artwork] GEMINI_REQUEST", {
    endpoint: GEMINI_ENDPOINT,
    model: GEMINI_MODEL,
    temperature: 0,
    topP: 0.1,
    groundingTool: "google_search",
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
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: unknown;
    }[];
  } | null;

  const rawText = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const groundingMetadata = payload?.candidates?.[0]?.groundingMetadata;
  console.log("[identify-artwork] GEMINI_RAW_TEXT", rawText);
  console.log("[identify-artwork] GEMINI_GROUNDING_METADATA", JSON.stringify(groundingMetadata ?? null));

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
