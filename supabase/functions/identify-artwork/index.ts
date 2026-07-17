// Supabase Edge Function: identify-artwork
// Uses Google Cloud Vision API's WEB_DETECTION to identify an artwork from an image.
// Accepts JSON: { imageBase64: string, mimeType?: string } or { imageUrl: string }
// Returns: { title, artist, year, medium, confident, raw: { webEntities, bestGuessLabels, pagesWithMatchingImages } }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VisionWebEntity {
  entityId?: string;
  score?: number;
  description?: string;
}

interface VisionPage {
  url?: string;
  pageTitle?: string;
  score?: number;
}

interface VisionWebDetection {
  webEntities?: VisionWebEntity[];
  bestGuessLabels?: { label?: string; languageCode?: string }[];
  pagesWithMatchingImages?: VisionPage[];
  fullMatchingImages?: { url?: string }[];
  partialMatchingImages?: { url?: string }[];
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

// Try to pull "Artist Name" and a 4-digit year out of a candidate title/description string.
function extractYear(text: string): string | null {
  // Match "c. 1503", "1889", "1912–1913", "1912-1913"
  const circa = text.match(/\bc\.?\s*\d{3,4}\b/i);
  if (circa) return circa[0];
  const range = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\s*[–-]\s*(1[0-9]{3}|20[0-2][0-9])\b/);
  if (range) return range[0];
  const single = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return single ? single[0] : null;
}

// Common medium keywords to detect in surrounding text (page titles, entities).
const MEDIUM_KEYWORDS = [
  "oil on canvas",
  "oil on panel",
  "oil on wood",
  "acrylic on canvas",
  "tempera on panel",
  "tempera on wood",
  "watercolor",
  "gouache",
  "fresco",
  "marble",
  "bronze",
  "sculpture",
  "lithograph",
  "etching",
  "engraving",
  "woodcut",
  "photograph",
  "gelatin silver print",
  "mixed media",
  "pastel",
  "charcoal",
  "ink on paper",
  "pencil on paper",
];

function extractMedium(text: string): string | null {
  const lower = text.toLowerCase();
  for (const m of MEDIUM_KEYWORDS) {
    if (lower.includes(m)) return m.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

// Parse "Title by Artist" or "Title, Artist" out of best-guess labels / page titles.
function splitTitleArtist(text: string): { title: string | null; artist: string | null } {
  const cleaned = text.replace(/\s+[-–|·].*$/, "").trim();
  const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
  const commaMatch = cleaned.match(/^(.+?),\s*(.+)$/);
  if (commaMatch) return { title: commaMatch[1].trim(), artist: commaMatch[2].trim() };
  return { title: cleaned || null, artist: null };
}

function parseWebDetection(web: VisionWebDetection) {
  const entities = (web.webEntities ?? []).filter(
    (e) => e.description && (e.score ?? 0) > 0.3,
  );
  const bestGuess = web.bestGuessLabels?.[0]?.label ?? null;
  const pageTitles = (web.pagesWithMatchingImages ?? [])
    .map((p) => p.pageTitle)
    .filter((t): t is string => typeof t === "string" && t.length > 0);

  const corpus = [bestGuess ?? "", ...pageTitles, ...entities.map((e) => e.description ?? "")].join(" \n ");

  // Title: prefer best guess; fall back to highest-scoring entity.
  let title: string | null = null;
  let artist: string | null = null;

  if (bestGuess) {
    const parsed = splitTitleArtist(bestGuess);
    title = parsed.title;
    artist = parsed.artist;
  }

  if (!title && entities.length > 0) {
    title = entities[0].description ?? null;
  }

  // Artist heuristic: look for an entity that reads like a person's name
  // (two capitalized words) and is not the title.
  if (!artist) {
    for (const e of entities) {
      const d = e.description ?? "";
      if (d === title) continue;
      if (/^[A-Z][a-zà-ÿ'’.-]+(?:\s+[A-Z][a-zà-ÿ'’.-]+){1,3}$/.test(d)) {
        artist = d;
        break;
      }
    }
  }

  // Try artist from page titles like "Title by Artist - Museum"
  if (!artist) {
    for (const t of pageTitles) {
      const parsed = splitTitleArtist(t);
      if (parsed.artist) {
        artist = parsed.artist;
        if (!title) title = parsed.title;
        break;
      }
    }
  }

  const year = extractYear(corpus);
  const medium = extractMedium(corpus);

  const confident = Boolean(title && artist);

  return {
    confident,
    title: title ?? null,
    artist: artist ?? null,
    year: year ?? null,
    medium: medium ?? null,
    raw: {
      webEntities: entities,
      bestGuessLabels: web.bestGuessLabels ?? [],
      pagesWithMatchingImages: (web.pagesWithMatchingImages ?? []).slice(0, 10),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  if (!apiKey) return json(500, { error: "GOOGLE_VISION_API_KEY not configured" });

  let body: { imageBase64?: string; imageUrl?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!body.imageBase64 && !body.imageUrl) {
    return json(400, { error: "Provide imageBase64 or imageUrl" });
  }

  const image = body.imageBase64
    ? { content: body.imageBase64 }
    : { source: { imageUri: body.imageUrl } };

  const visionRequest = {
    requests: [
      {
        image,
        features: [{ type: "WEB_DETECTION", maxResults: 15 }],
      },
    ],
  };

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(visionRequest),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error("Vision API error", resp.status, text);
    return json(502, { error: "Vision API request failed", status: resp.status, detail: text });
  }

  const payload = await resp.json();
  const web: VisionWebDetection = payload?.responses?.[0]?.webDetection ?? {};
  const parsed = parseWebDetection(web);
  return json(200, parsed);
});
