// Supabase Edge Function: identify-artwork
//
// Calls the official Google Gemini API directly with GEMINI_API_KEY,
// using gemini-3.5-flash-lite with a JSON schema constraint.
//
// Body: { imageBase64, mimeType?, museum?, city?, country? }
// Response: { title, artist, year, medium, confident }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK = "couldn't identify, enter manually";
const MODEL = "gemini-2.5-pro";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

interface RequestBody {
  imageBase64?: string;
  mimeType?: string;
  museum?: string;
  city?: string;
  country?: string;
}

interface IdentifyResult {
  title: string;
  artist: string;
  year: string;
  medium: string;
  confident: boolean;
}

function normalize(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  if (/^(unknown|n\/?a|none|null|not (specified|available|known))$/i.test(s)) return "";
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json(500, { error: "Missing GEMINI_API_KEY" });

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

  const museum = normalize(body.museum);
  const city = normalize(body.city);
  const country = normalize(body.country);
  const contextParts = [museum, city, country].filter(Boolean);
  const locationLabel = contextParts.length ? contextParts.join(", ") : "an unspecified museum";

  const promptText = `You are identifying a specific artwork from a photograph taken by a visitor at ${locationLabel}.

Rules — read carefully:
1. Only fill a field (title, artist, year, medium) if you actually RECOGNIZE this specific artwork from the image itself. Recognition means you can name the exact work, not just guess based on style, subject, or the museum's collection.
2. If you recognize the artist but are not certain of the exact title, return the artist and leave title empty. Do NOT invent a plausible-sounding title. Same rule for every field independently.
3. If you are unsure of the year, medium, or any other detail, return an empty string for that field. Do NOT approximate ("circa 2000", "early 2000s") — either the exact known value or empty.
4. Set confident=true ONLY if you would stake your reputation on the exact title AND artist matching this specific work. Otherwise confident=false.
5. Never guess from context alone (museum name, room, style). The image must be the primary evidence.

Return strictly the JSON schema. Empty string means "I don't know" — that is the correct answer when uncertain.`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
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
          confident: { type: "BOOLEAN" },
        },
        required: ["title", "artist", "year", "medium", "confident"],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    console.error("[identify-artwork] Gemini fetch failed", err);
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
      confident: false,
    });
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[identify-artwork] Gemini ${resp.status}: ${text}`);
    if (resp.status === 429) return json(429, { error: "Rate limit exceeded, please try again shortly." });
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
      confident: false,
    });
  }

  const payload = await resp.json().catch(() => null) as
    | { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    | null;
  const content = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let parsed: Partial<IdentifyResult> = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("[identify-artwork] failed to parse model JSON:", content);
  }

  const title = normalize(parsed.title);
  const artist = normalize(parsed.artist);
  const year = normalize(parsed.year);
  const medium = normalize(parsed.medium);
  const anyField = title || artist || year || medium;

  if (!anyField) {
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
      confident: false,
    });
  }

  return json(200, {
    title: title || FALLBACK,
    artist: artist || FALLBACK,
    year: year || FALLBACK,
    medium: medium || FALLBACK,
    confident: Boolean(parsed.confident) && Boolean(title) && Boolean(artist),
  });
});
