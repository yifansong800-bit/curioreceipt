// Supabase Edge Function: identify-artwork
// Reverse-image-search pipeline with reranking + per-candidate extraction:
//   1. Google Cloud Vision WEB_DETECTION on the uploaded image.
//   2. Take top-5 matching pages, rerank so official collection catalog URLs
//      (/collection/, /object/, /artwork/, etc.) come first.
//   3. For each candidate (in rank order), fetch the HTML, locate the
//      block surrounding the matched image asset (fullMatchingImages URL),
//      strip tags to get the caption/context text.
//   4. Send that isolated text + web entities + user museum context to
//      DeepSeek for strict JSON extraction. Stop as soon as we get a
//      confident result; otherwise return the best partial result.
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
interface VisionPage {
  url?: string;
  pageTitle?: string;
  score?: number;
  fullMatchingImages?: { url?: string }[];
  partialMatchingImages?: { url?: string }[];
}
interface VisionWebDetection {
  webEntities?: VisionWebEntity[];
  bestGuessLabels?: { label?: string }[];
  pagesWithMatchingImages?: VisionPage[];
  fullMatchingImages?: { url?: string }[];
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
          features: [{ type: "WEB_DETECTION", maxResults: 20 }],
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

// Rerank the top-N pages so catalog/object pages come first. Museum
// collection pages consistently host the caption text (title, artist,
// year, medium) directly under the artwork image, unlike blog posts,
// news articles, or aggregator sites.
const CATALOG_PATTERNS = [
  /\/collection[s]?\//i,
  /\/object[s]?\//i,
  /\/artwork[s]?\//i,
  /\/artist[s]?\//i,
  /\/art\//i,
  /\/oeuvre[s]?\//i,
  /\/work[s]?\//i,
  /\/piece[s]?\//i,
  /\/exhibition[s]?\//i,
];
const CATALOG_HOST_HINTS = [
  "museum", "gallery", "moma", "metmuseum", "tate", "guggenheim",
  "artic.edu", "nga.gov", "mplus", "louvre", "britishmuseum",
  "nationalgallery", "smb.museum", "centrepompidou", "rijksmuseum",
  "smithsonian", "getty.edu", "hammer.ucla", "whitney.org",
];
const BLOCKLIST_HOSTS = ["pinterest.", "wikipedia.", "wikimedia.", "reddit.", "tumblr.", "facebook."];

function rerankPages(pages: VisionPage[]): VisionPage[] {
  const scored = pages.filter((p) => p.url).map((p) => {
    const url = p.url!.toLowerCase();
    let score = p.score ?? 0;
    if (CATALOG_PATTERNS.some((re) => re.test(url))) score += 10;
    if (CATALOG_HOST_HINTS.some((h) => url.includes(h))) score += 5;
    if (BLOCKLIST_HOSTS.some((h) => url.includes(h))) score -= 8;
    if ((p.fullMatchingImages?.length ?? 0) > 0) score += 2;
    return { page: p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.page);
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

// Try to isolate the caption/metadata block surrounding the matched image
// on the page. Strategy:
//   1. Find the first <img> whose src matches one of the image URLs from
//      Vision's fullMatchingImages / partialMatchingImages.
//   2. Return a window of HTML ~4000 chars centered on that <img>.
// Falls back to the whole body when no matched <img> can be found.
function isolateImageContext(html: string, imageUrls: string[]): string {
  const lowerHtml = html;
  let bestIdx = -1;
  for (const raw of imageUrls) {
    if (!raw) continue;
    const filename = raw.split("/").pop()?.split("?")[0];
    const needles = [raw, filename].filter(Boolean) as string[];
    for (const needle of needles) {
      const idx = lowerHtml.indexOf(needle);
      if (idx !== -1) { bestIdx = idx; break; }
    }
    if (bestIdx !== -1) break;
  }
  if (bestIdx === -1) return html;
  // Grab the enclosing <figure>/<article>/<section> if we can find one nearby.
  const windowStart = Math.max(0, bestIdx - 2000);
  const windowEnd = Math.min(lowerHtml.length, bestIdx + 4000);
  return lowerHtml.slice(windowStart, windowEnd);
}

interface Candidate { url: string; text: string }

async function fetchCandidate(page: VisionPage, extraImageUrls: string[]): Promise<Candidate | null> {
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
      return null;
    }
    const html = await resp.text();
    const imgUrls = [
      ...(page.fullMatchingImages ?? []).map((i) => i.url).filter(Boolean) as string[],
      ...(page.partialMatchingImages ?? []).map((i) => i.url).filter(Boolean) as string[],
      ...extraImageUrls,
    ];
    const isolated = isolateImageContext(html, imgUrls);
    const text = stripHtml(isolated).slice(0, 3500);
    if (text.length < 80) {
      console.warn("[identify-artwork] isolated text too short, skipping", url);
      return null;
    }
    console.log("[identify-artwork] scraped", text.length, "chars from", url, "(isolated:", isolated.length !== html.length, ")");
    return { url, text };
  } catch (err) {
    console.warn("[identify-artwork] fetch error", url, err instanceof Error ? err.message : err);
    return null;
  }
}

interface DeepSeekResult { title: string; artist: string; year: string; medium: string }

function scoreResult(r: DeepSeekResult): number {
  return (r.title !== FALLBACK ? 2 : 0) +
    (r.artist !== FALLBACK ? 2 : 0) +
    (r.year !== FALLBACK ? 1 : 0) +
    (r.medium !== FALLBACK ? 1 : 0);
}

async function extractWithDeepSeek(
  apiKey: string,
  ctx: { museum: string; location: string; entities: string[]; bestGuess: string; pageText: string; pageUrl: string },
): Promise<DeepSeekResult> {
  console.log("[identify-artwork] step 3: calling DeepSeek for", ctx.pageUrl);
  const userPrompt =
    `You are extracting artwork metadata from reverse-image-search results.\n` +
    `The user photographed a piece at: ${ctx.museum || "an unspecified museum"}${ctx.location ? ` (${ctx.location})` : ""}.\n\n` +
    `WEBPAGE SOURCE (${ctx.pageUrl}):\n${ctx.pageText}\n\n` +
    `GOOGLE BEST GUESS LABEL: ${ctx.bestGuess || "(none)"}\n` +
    `GOOGLE WEB ENTITIES: ${ctx.entities.slice(0, 15).join(" | ") || "(none)"}\n\n` +
    `The webpage source above is the HTML region surrounding the matched artwork image, ` +
    `so the caption/label text near the image is the most reliable ground truth. ` +
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
    const globalFullImages = (web.fullMatchingImages ?? [])
      .map((i) => i.url).filter(Boolean) as string[];

    const ranked = rerankPages(pages);
    console.log("[identify-artwork] reranked top", ranked.length, "candidates:",
      ranked.map((p) => p.url));

    let best: { result: DeepSeekResult; url: string } | null = null;

    for (const page of ranked) {
      const candidate = await fetchCandidate(page, globalFullImages);
      if (!candidate) continue;
      try {
        const result = await extractWithDeepSeek(deepseekKey, {
          museum, location, entities, bestGuess,
          pageText: candidate.text, pageUrl: candidate.url,
        });
        const score = scoreResult(result);
        console.log("[identify-artwork] candidate scored", score, "from", candidate.url);
        if (!best || score > scoreResult(best.result)) {
          best = { result, url: candidate.url };
        }
        // Fully confident (title + artist + year + medium) → stop early.
        if (score >= 6) break;
      } catch (err) {
        console.warn("[identify-artwork] deepseek error on", candidate.url, err instanceof Error ? err.message : err);
      }
    }

    // Final fallback: entities-only extraction if nothing scraped.
    if (!best) {
      console.log("[identify-artwork] no scraped candidates; running entities-only extraction");
      const result = await extractWithDeepSeek(deepseekKey, {
        museum, location, entities, bestGuess,
        pageText: "(no webpage scraped — rely on the Google web entities below)",
        pageUrl: "(none)",
      });
      best = { result, url: "" };
    }

    const result = best.result;
    const confident =
      result.title !== FALLBACK && (result.artist !== FALLBACK || result.year !== FALLBACK || result.medium !== FALLBACK);

    console.log("[identify-artwork] done", { confident, sourceUrl: best.url, ...result });
    return json(200, {
      ...result,
      confident,
      source: "vision+deepseek",
      sourceUrl: best.url || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[identify-artwork] pipeline failed:", msg);
    return json(500, { error: msg });
  }
});
