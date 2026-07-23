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

  const promptText = `Identify the title, artist name, year, and medium of this artwork seen in ${locationLabel}. Only claim a field if you are confident based on the image and context; otherwise return an empty string for that field. Set confident=true only if you are certain of at least the title AND artist.`;

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
