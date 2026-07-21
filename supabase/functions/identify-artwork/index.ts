// Supabase Edge Function: identify-artwork
// Three-step reverse-search pipeline:
//   1. Google Cloud Vision WEB_DETECTION on the uploaded image.
//   2. Fetch the top matched webpage's HTML, strip tags to raw body text.
//   3. Pass the scraped text + web entities + user museum context to DeepSeek
//      and have it extract a strict JSON {title, artist, year, medium}.
//
// Body: {
//   imageBase64: string,   // required (no data: prefix)
//   mimeType?: string,     // informational
//   museum?: string,       // user-provided context
//   city?: string | null,
//   country?: string | null,
// }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK = "couldn't identify, enter manually";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

interface VisionWebEntity { description?: string; score?: number }
interface VisionPage { url?: string; pageTitle?: string; score?: number }
interface VisionWebDetection {
  webEntities?: VisionWebEntity[];
  bestGuessLabels?: { label?: string }[];
  pagesWithMatchingImages?: VisionPage[];
}

async function runVision(apiKey: string, imageBase64: string): Promise<VisionWebDetection> {
  console.log("[identify-artwork] step 1: calling Google Vision WEB_DETECTION");
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "WEB_DETECTION", maxResults: 15 }],
        }],
      }),
    },
  );
  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 500);
    throw new Error(`Vision API ${resp.status}: ${detail}`);
  }
  const payload = await resp.json();
  const web: VisionWebDetection = payload?.responses?.[0]?.webDetection ?? {};
  console.log(
    "[identify-artwork] vision returned",
    (web.webEntities ?? []).length, "entities,",
    (web.pagesWithMatchingImages ?? []).length, "pages",
  );
  return web;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageText(pages: VisionPage[]): Promise<{ url: string; text: string } | null> {
  const candidates = pages.filter((p) => p.url).slice(0, 3);
  for (const page of candidates) {
    const url = page.url!;
    console.log("[identify-artwork] step 2: fetching", url);
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; CurioBot/1.0; +https://curioreceipt.com)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!resp.ok) {
        console.warn("[identify-artwork] fetch failed", url, resp.status);
        continue;
      }
      const html = await resp.text();
      const text = stripHtml(html).slice(0, 3000);
      if (text.length < 100) {
        console.warn("[identify-artwork] fetched text too short, skipping", url);
        continue;
      }
      console.log("[identify-artwork] scraped", text.length, "chars from", url);
      return { url, text };
    } catch (err) {
      console.warn("[identify-artwork] fetch error", url, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

interface DeepSeekResult { title: string; artist: string; year: string; medium: string }

async function extractWithDeepSeek(
  apiKey: string,
  ctx: { museum: string; location: string; entities: string[]; bestGuess: string; pageText: string | null; pageUrl: string | null },
): Promise<DeepSeekResult> {
  console.log("[identify-artwork] step 3: calling DeepSeek for extraction");
  const sourceBlock = ctx.pageText
    ? `WEBPAGE SOURCE (${ctx.pageUrl}):\n${ctx.pageText}`
    : "WEBPAGE SOURCE: (unavailable — rely on the Google web entities below)";

  const userPrompt =
    `You are extracting artwork metadata from reverse-image-search results.\n` +
    `The user photographed a piece at: ${ctx.museum || "an unspecified museum"}${ctx.location ? ` (${ctx.location})` : ""}.\n\n` +
    `${sourceBlock}\n\n` +
    `GOOGLE BEST GUESS LABEL: ${ctx.bestGuess || "(none)"}\n` +
    `GOOGLE WEB ENTITIES: ${ctx.entities.slice(0, 15).join(" | ") || "(none)"}\n\n` +
    `Extract the artwork's title, artist, year created, and medium STRICTLY from the sources above. ` +
    `Do NOT invent or guess facts that are not present in the sources. ` +
    `Ignore website navigation, museum names, exhibition titles, and page headers — they are not the artwork title. ` +
    `If a field is not clearly present, set it to exactly: "${FALLBACK}".\n\n` +
    `Return ONLY raw JSON (no markdown, no commentary) with this exact schema:\n` +
    `{"title": "string", "artist": "string", "year": "string", "medium": "string"}`;

  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract structured artwork metadata from provided source text. You never invent facts. You always return one JSON object matching the requested schema.",
        },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 500);
    throw new Error(`DeepSeek ${resp.status}: ${detail}`);
  }
  const payload = await resp.json();
  const text: string = payload?.choices?.[0]?.message?.content ?? "";
  console.log("[identify-artwork] deepseek raw:", text.slice(0, 300));
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(text.slice(start, end + 1)); } catch { /* noop */ }
    }
  }
  const pick = (k: string): string => {
    const v = parsed[k];
    if (typeof v !== "string") return FALLBACK;
    const cleaned = v.trim();
    if (!cleaned || /^(null|unknown|n\/a|none|not available|not specified|unspecified)$/i.test(cleaned)) {
      return FALLBACK;
    }
    return cleaned;
  };
  return { title: pick("title"), artist: pick("artist"), year: pick("year"), medium: pick("medium") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!visionKey) return json(500, { error: "GOOGLE_VISION_API_KEY not configured" });
  if (!deepseekKey) return json(500, { error: "DEEPSEEK_API_KEY not configured" });

  let body: {
    imageBase64?: string;
    mimeType?: string;
    museum?: string;
    city?: string | null;
    country?: string | null;
  };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body" }); }
  if (!body.imageBase64) return json(400, { error: "imageBase64 is required" });

  const museum = (body.museum ?? "").trim();
  const location = [body.city, body.country].filter(Boolean).join(", ");
  console.log("[identify-artwork] request received", { museum, location, mimeType: body.mimeType });

  try {
    const web = await runVision(visionKey, body.imageBase64);
    const entities = (web.webEntities ?? [])
      .filter((e) => e.description && (e.score ?? 0) > 0.3)
      .map((e) => e.description!) as string[];
    const bestGuess = web.bestGuessLabels?.[0]?.label ?? "";
    const pages = web.pagesWithMatchingImages ?? [];

    const scraped = pages.length ? await fetchPageText(pages) : null;
    if (!scraped) console.log("[identify-artwork] no scraped page; falling back to entities only");

    const result = await extractWithDeepSeek(deepseekKey, {
      museum,
      location,
      entities,
      bestGuess,
      pageText: scraped?.text ?? null,
      pageUrl: scraped?.url ?? null,
    });

    const confident =
      result.title !== FALLBACK && (result.artist !== FALLBACK || result.year !== FALLBACK || result.medium !== FALLBACK);

    console.log("[identify-artwork] done", { confident, ...result });
    return json(200, {
      ...result,
      confident,
      source: "vision+deepseek",
      sourceUrl: scraped?.url ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[identify-artwork] pipeline failed:", msg);
    return json(500, { error: msg });
  }
});
