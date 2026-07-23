// Supabase Edge Function: identify-artwork
//
// Simple single-shot artwork identification using the Lovable AI Gateway
// (Gemini 2.5 Flash-Lite vision) with a JSON-schema-constrained response.
//
// Body: { imageBase64, mimeType?, museum?, city?, country? }
// Response: { title, artist, year, medium, confident, sources? }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK = "couldn't identify, enter manually";
const MODEL = "google/gemini-2.5-flash-lite";

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

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return json(500, { error: "Missing LOVABLE_API_KEY" });

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
  const contextLine = contextParts.length
    ? `Museum/location context provided by the user: ${contextParts.join(", ")}. Use this to disambiguate, but do not invent details that aren't supported by the image.`
    : "No museum context was provided.";

  const systemPrompt = [
    "You identify artworks from a photograph taken by a museum visitor.",
    "Return the exact title, artist, creation year, and medium of the depicted artwork.",
    "Only claim details you are highly confident about from visual evidence (style, signature, plaque if visible) plus the museum context.",
    "If you are not confident about a specific field, return an empty string for that field.",
    "Set confident=true only if you are certain of at least the title AND artist. Otherwise confident=false.",
    "Never guess or fabricate. Empty string is always better than a wrong answer.",
    contextLine,
  ].join(" ");

  const requestBody = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Identify this artwork." },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "artwork_identification",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "Exact artwork title, or empty string if unsure." },
            artist: { type: "string", description: "Full artist name, or empty string if unsure." },
            year: { type: "string", description: "Year or year range created (e.g. '1889'), or empty string if unsure." },
            medium: { type: "string", description: "Medium/materials (e.g. 'Oil on canvas'), or empty string if unsure." },
            confident: { type: "boolean" },
          },
          required: ["title", "artist", "year", "medium", "confident"],
        },
      },
    },
  };

  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    console.error("[identify-artwork] gateway fetch failed", err);
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
      confident: false,
    });
  }

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[identify-artwork] gateway ${resp.status}: ${text}`);
    if (resp.status === 429) return json(429, { error: "Rate limit exceeded, please try again shortly." });
    if (resp.status === 402) return json(402, { error: "AI credits exhausted." });
    return json(200, {
      title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
      confident: false,
    });
  }

  const payload = await resp.json().catch(() => null) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const content = payload?.choices?.[0]?.message?.content ?? "";
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
