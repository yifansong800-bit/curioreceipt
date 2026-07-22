// Supabase Edge Function: identify-artwork
//
// Museum-aware reverse-image identification pipeline (spec v2):
//   1. Google Vision WEB_DETECTION.
//   2. Candidate collection: museum's own domain > trusted allowlist > rest.
//   3. Two-gate verification per page:
//        Gate 1 (identity)   — og:image matches Vision's matched image URL
//                              (skipped when Vision returned no image-match
//                              data, e.g. real photos of an artwork).
//        Gate 2 (specificity)— JSON-LD VisualArtwork/Painting OR labeled
//                              details block. Otherwise compare og:description
//                              to the homepage: identical text = sitewide
//                              boilerplate → fail. Unique prose → pass but
//                              flag as unstructured.
//   4. Cross-validation: accept a field only when 2+ passing sources agree,
//      OR a single museum-domain source with a structured details block.
//   5. LLM extraction (DeepSeek) — only for unstructured-but-passing pages,
//      strict "return null if not explicitly stated" prompt.
//   6. No-match fallback: return non-confident + FALLBACK fields so the UI
//      shows "couldn't find a match — enter manually". No AI guessing.
//
// Body: { imageBase64, mimeType?, museum?, city?, country? }
// Response: { title, artist, year, medium, confident, sourceUrl, sources? }

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

// ---------- types ----------

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
  partialMatchingImages?: { url?: string }[];
}

type Priority = "museum" | "trusted" | "other";

interface RankedPage {
  page: VisionPage;
  url: string;
  host: string;
  priority: Priority;
  hasImageMatch: boolean;
}

interface ExtractedFields {
  title: string | null;
  artist: string | null;
  year: string | null;
  medium: string | null;
}

interface PassingSource {
  url: string;
  host: string;
  priority: Priority;
  structured: boolean; // Gate 2 via JSON-LD or labeled details block
  fields: ExtractedFields;
}

// ---------- museum domain lookup ----------

// Curated map from museum keywords → canonical domain hosts. Matching is
// case-insensitive substring on the user-provided museum name.
const MUSEUM_DOMAINS: { keywords: string[]; host: string; collectionApi?: string }[] = [
  { keywords: ["m+", "m plus", "mplus"], host: "mplus.org.hk" },
  { keywords: ["moma", "museum of modern art"], host: "moma.org" },
  { keywords: ["met ", "metropolitan"], host: "metmuseum.org",
    collectionApi: "https://collectionapi.metmuseum.org/public/collection/v1/search?q=" },
  { keywords: ["tate"], host: "tate.org.uk" },
  { keywords: ["guggenheim"], host: "guggenheim.org" },
  { keywords: ["art institute of chicago", "artic"], host: "artic.edu",
    collectionApi: "https://api.artic.edu/api/v1/artworks/search?q=" },
  { keywords: ["national gallery of art", "nga"], host: "nga.gov" },
  { keywords: ["louvre"], host: "louvre.fr" },
  { keywords: ["british museum"], host: "britishmuseum.org" },
  { keywords: ["national gallery"], host: "nationalgallery.org.uk" },
  { keywords: ["centre pompidou", "pompidou"], host: "centrepompidou.fr" },
  { keywords: ["rijksmuseum"], host: "rijksmuseum.nl",
    collectionApi: "https://www.rijksmuseum.nl/api/en/collection?key=0fiuZFh4&q=" },
  { keywords: ["smithsonian"], host: "si.edu" },
  { keywords: ["getty"], host: "getty.edu" },
  { keywords: ["whitney"], host: "whitney.org" },
  { keywords: ["smb", "staatliche museen"], host: "smb.museum" },
  { keywords: ["hammer"], host: "hammer.ucla.edu" },
  { keywords: ["van gogh"], host: "vangoghmuseum.nl" },
  { keywords: ["uffizi"], host: "uffizi.it" },
  { keywords: ["prado"], host: "museodelprado.es" },
  { keywords: ["reina sofia"], host: "museoreinasofia.es" },
  { keywords: ["national museum of china"], host: "chnmuseum.cn" },
  { keywords: ["palace museum", "forbidden city"], host: "dpm.org.cn" },
  { keywords: ["hong kong museum of art"], host: "hk.art.museum" },
];

const TRUSTED_HOSTS = [
  "wikipedia.org", "wikimedia.org", "wikidata.org",
  "europeana.eu", "artsy.net", "google.com/culturalinstitute",
  "artsandculture.google.com",
  "christies.com", "sothebys.com", "phillips.com", "bonhams.com",
];

const BLOCKLIST_HOSTS = [
  "pinterest.", "reddit.", "tumblr.", "facebook.", "instagram.",
  "twitter.", "x.com", "tiktok.", "youtube.",
];

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

function resolveMuseumHost(museum: string): string | null {
  const m = museum.toLowerCase();
  if (!m) return null;
  const hit = MUSEUM_DOMAINS.find((entry) => entry.keywords.some((k) => m.includes(k)));
  return hit?.host ?? null;
}

function resolveMuseumApi(museum: string): string | null {
  const m = museum.toLowerCase();
  const hit = MUSEUM_DOMAINS.find((entry) => entry.keywords.some((k) => m.includes(k)));
  return hit?.collectionApi ?? null;
}

// ---------- STEP 1: Vision ----------

async function runVision(apiKey: string, imageBase64: string): Promise<VisionWebDetection> {
  console.log("[identify] step 1 — Google Vision WEB_DETECTION");
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: "WEB_DETECTION", maxResults: 25 }],
        }],
      }),
    },
  );
  if (!resp.ok) throw new Error(`Vision API ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const web: VisionWebDetection = (await resp.json())?.responses?.[0]?.webDetection ?? {};
  console.log("[identify] vision:",
    (web.webEntities ?? []).length, "entities,",
    (web.pagesWithMatchingImages ?? []).length, "pages,",
    (web.fullMatchingImages ?? []).length, "full-match,",
    (web.partialMatchingImages ?? []).length, "partial-match");
  return web;
}

// ---------- STEP 2: candidate collection ----------

function rankPages(pages: VisionPage[], museumHost: string | null): RankedPage[] {
  const seen = new Set<string>();
  const ranked: RankedPage[] = [];
  for (const p of pages) {
    if (!p.url) continue;
    const host = hostOf(p.url);
    if (!host || seen.has(p.url)) continue;
    if (BLOCKLIST_HOSTS.some((b) => host.includes(b))) continue;
    seen.add(p.url);

    const hasImageMatch =
      (p.fullMatchingImages?.length ?? 0) > 0 ||
      (p.partialMatchingImages?.length ?? 0) > 0;

    let priority: Priority = "other";
    if (museumHost && host.endsWith(museumHost)) priority = "museum";
    else if (TRUSTED_HOSTS.some((t) => host.includes(t) || p.url!.includes(t))) priority = "trusted";

    ranked.push({ page: p, url: p.url, host, priority, hasImageMatch });
  }
  const rank = (r: RankedPage) =>
    (r.priority === "museum" ? 100 : r.priority === "trusted" ? 50 : 0) +
    (r.hasImageMatch ? 5 : 0) +
    (r.page.score ?? 0);
  ranked.sort((a, b) => rank(b) - rank(a));
  return ranked.slice(0, 8);
}

// ---------- STEP 3: two-gate verification ----------

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CurioBot/1.0; +https://curioreceipt.com)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!resp.ok) return null;
    return await resp.text();
  } catch { return null; }
}

function metaContent(html: string, key: "og:image" | "og:description" | "description"): string {
  const attr = key.startsWith("og:") ? "property" : "name";
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*${attr}=["']${key}["']`, "i");
  return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? "").trim();
}

// Gate 1 — does the page's og:image (or any prominent img) point to the same
// asset Vision matched? Skipped when Vision has no image match to compare.
function gate1(html: string, matchUrls: string[]): boolean | null {
  if (matchUrls.length === 0) return null; // not applicable
  const og = metaContent(html, "og:image");
  const needles = matchUrls
    .flatMap((u) => {
      const file = u.split("/").pop()?.split("?")[0] ?? "";
      return [u, file].filter(Boolean);
    })
    .map((s) => s.toLowerCase());
  const hay = (og + " " + html).toLowerCase();
  return needles.some((n) => n && hay.includes(n));
}

// Gate 2 — extract JSON-LD VisualArtwork/Painting OR a labeled details block.
// Returns extracted fields when structured; { text } when only unstructured
// prose is available; false when the page is boilerplate.
async function gate2(
  html: string,
  pageUrl: string,
  homepageDesc: string | null,
): Promise<
  | { structured: true; fields: ExtractedFields }
  | { structured: false; text: string }
  | false
> {
  // 2a. JSON-LD.
  const ldMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ldMatches) {
    const bodyMatch = block.match(/>([\s\S]*?)<\/script>/i);
    if (!bodyMatch) continue;
    try {
      const parsed = JSON.parse(bodyMatch[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const type = String(node?.["@type"] ?? "").toLowerCase();
        if (!["visualartwork", "painting", "creativework", "sculpture"].some((t) => type.includes(t))) continue;
        const fields: ExtractedFields = {
          title: pickStr(node.name) ?? null,
          artist: pickStr(node.creator?.name ?? node.creator ?? node.author?.name ?? node.author) ?? null,
          year: pickStr(node.dateCreated ?? node.dateProduced ?? node.datePublished) ?? null,
          medium: pickStr(node.artMedium ?? node.material ?? node.medium) ?? null,
        };
        if (fields.title || fields.artist) {
          console.log("[identify] gate2 JSON-LD hit for", pageUrl);
          return { structured: true, fields };
        }
      }
    } catch { /* not JSON */ }
  }

  // 2b. Labeled details block (rows like "Artist:", "Medium:", "Date:").
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const rows: Record<string, string> = {};
  const rowPatterns = [
    /(?:artist|creator|maker|artist name|by)\s*[:\-]?\s*<[^>]+>\s*([^<\n]{2,120})/i,
    /<dt[^>]*>\s*(?:artist|creator|maker|by)[^<]*<\/dt>\s*<dd[^>]*>\s*([^<]{2,120})<\/dd>/i,
    /<th[^>]*>\s*(?:artist|creator|maker)[^<]*<\/th>\s*<td[^>]*>\s*([^<]{2,120})<\/td>/i,
  ];
  for (const re of rowPatterns) {
    const m = stripped.match(re);
    if (m?.[1]) { rows.artist = m[1].trim(); break; }
  }
  const titleRow = stripped.match(/<dt[^>]*>\s*title[^<]*<\/dt>\s*<dd[^>]*>\s*([^<]{2,200})<\/dd>/i)
    ?? stripped.match(/<th[^>]*>\s*title[^<]*<\/th>\s*<td[^>]*>\s*([^<]{2,200})<\/td>/i);
  if (titleRow?.[1]) rows.title = titleRow[1].trim();
  const mediumRow = stripped.match(/(?:<dt|<th)[^>]*>\s*(?:medium|material)[^<]*<\/(?:dt|th)>\s*(?:<dd|<td)[^>]*>\s*([^<]{2,200})<\/(?:dd|td)>/i);
  if (mediumRow?.[1]) rows.medium = mediumRow[1].trim();
  const dateRow = stripped.match(/(?:<dt|<th)[^>]*>\s*(?:date|year|dated|date created)[^<]*<\/(?:dt|th)>\s*(?:<dd|<td)[^>]*>\s*([^<]{2,60})<\/(?:dd|td)>/i);
  if (dateRow?.[1]) rows.year = dateRow[1].trim();
  if (rows.title || rows.artist) {
    console.log("[identify] gate2 labeled-rows hit for", pageUrl);
    return { structured: true, fields: {
      title: rows.title ?? null, artist: rows.artist ?? null,
      year: rows.year ?? null, medium: rows.medium ?? null,
    } };
  }

  // 2c. Fall through to prose. Compare og:description against homepage — if
  // identical it's sitewide boilerplate.
  const desc = metaContent(html, "og:description") || metaContent(html, "description");
  if (desc && homepageDesc) {
    const a = desc.replace(/\s+/g, " ").trim().toLowerCase();
    const b = homepageDesc.replace(/\s+/g, " ").trim().toLowerCase();
    if (a && a === b) {
      console.log("[identify] gate2 boilerplate reject for", pageUrl);
      return false;
    }
  }
  // Pull a small unstructured text sample from around the page title/heading.
  const bodyText = stripped
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
  if (desc || bodyText.length > 120) {
    return { structured: false, text: (desc ? desc + "\n\n" : "") + bodyText };
  }
  return false;
}

function pickStr(v: unknown): string | null {
  if (typeof v === "string") { const t = v.trim(); return t || null; }
  if (Array.isArray(v)) return pickStr(v[0]);
  if (v && typeof v === "object") return pickStr((v as any).name ?? (v as any)["@value"]);
  return null;
}

// ---------- STEP 5: DeepSeek extraction for unstructured pages ----------

async function extractWithDeepSeek(
  apiKey: string,
  ctx: { museum: string; location: string; pageText: string; pageUrl: string },
): Promise<ExtractedFields> {
  console.log("[identify] step 5 — DeepSeek extraction for", ctx.pageUrl);
  const prompt =
    `The user photographed a piece at ${ctx.museum || "an unspecified museum"}` +
    `${ctx.location ? ` (${ctx.location})` : ""}.\n\n` +
    `Extract title, artist, year, and medium from the following text. ` +
    `Only return a field if explicitly and specifically stated as describing this artwork. ` +
    `Return null for any field not explicitly present. Do not guess or infer.\n\n` +
    `SOURCE (${ctx.pageUrl}):\n${ctx.pageText}\n\n` +
    `Respond in JSON only with this exact schema:\n` +
    `{"title": string|null, "artist": string|null, "year": string|null, "medium": string|null}`;
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You extract structured artwork metadata. You never invent facts. You return one JSON object matching the requested schema." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error(`DeepSeek ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
  const text = (await resp.json())?.choices?.[0]?.message?.content ?? "";
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text); } catch {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s !== -1 && e > s) { try { parsed = JSON.parse(text.slice(s, e + 1)); } catch { /* noop */ } }
  }
  const pick = (k: string): string | null => {
    const v = parsed[k];
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t || /^(null|unknown|n\/a|none|not (available|specified|stated))$/i.test(t)) return null;
    return t;
  };
  return { title: pick("title"), artist: pick("artist"), year: pick("year"), medium: pick("medium") };
}

// ---------- STEP 4: cross-validation ----------

function normalize(s: string | null): string {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function agree(a: string | null, b: string | null): boolean {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function crossValidate(sources: PassingSource[]): {
  fields: { title: string; artist: string; year: string; medium: string };
  confident: boolean;
  primary: PassingSource | null;
  conflicts: string[];
} {
  const conflicts: string[] = [];
  const museumStructured = sources.find((s) => s.priority === "museum" && s.structured);

  const pickField = (key: keyof ExtractedFields): string => {
    // Single museum-structured source is sufficient.
    if (museumStructured && museumStructured.fields[key]) {
      // But still surface conflict if others disagree.
      const others = sources.filter((s) => s !== museumStructured && s.fields[key]);
      for (const o of others) {
        if (!agree(museumStructured.fields[key], o.fields[key])) {
          conflicts.push(`${key}: "${museumStructured.fields[key]}" (museum) vs "${o.fields[key]}" (${o.host})`);
        }
      }
      return museumStructured.fields[key]!;
    }
    // Otherwise need 2+ agreeing sources.
    const values = sources.map((s) => s.fields[key]).filter(Boolean) as string[];
    for (let i = 0; i < values.length; i++) {
      const agreeing = values.filter((v) => agree(v, values[i]));
      if (agreeing.length >= 2) return values[i];
    }
    if (values.length >= 2) {
      conflicts.push(`${key}: ${values.map((v) => `"${v}"`).join(" vs ")}`);
    }
    return FALLBACK;
  };

  const fields = {
    title: pickField("title"),
    artist: pickField("artist"),
    year: pickField("year"),
    medium: pickField("medium"),
  };
  const confident = fields.title !== FALLBACK &&
    (fields.artist !== FALLBACK || fields.year !== FALLBACK);
  const primary = museumStructured ?? sources.find((s) => s.priority === "museum") ?? sources[0] ?? null;
  return { fields, confident, primary, conflicts };
}

// ---------- orchestrator ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const visionKey = Deno.env.get("GOOGLE_VISION_API_KEY");
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (!visionKey) return json(500, { error: "GOOGLE_VISION_API_KEY not configured" });
  if (!deepseekKey) return json(500, { error: "DEEPSEEK_API_KEY not configured" });

  let body: { imageBase64?: string; mimeType?: string; museum?: string; city?: string | null; country?: string | null };
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON body" }); }
  if (!body.imageBase64) return json(400, { error: "imageBase64 is required" });

  const museum = (body.museum ?? "").trim();
  const location = [body.city, body.country].filter(Boolean).join(", ");
  const museumHost = resolveMuseumHost(museum);
  console.log("[identify] request", { museum, location, museumHost });

  try {
    // STEP 1
    const web = await runVision(visionKey, body.imageBase64);
    const globalMatchUrls = [
      ...(web.fullMatchingImages ?? []).map((i) => i.url).filter(Boolean),
      ...(web.partialMatchingImages ?? []).map((i) => i.url).filter(Boolean),
    ] as string[];
    const entities = (web.webEntities ?? [])
      .filter((e) => e.description && (e.score ?? 0) > 0.5)
      .map((e) => e.description!) as string[];

    // STEP 2: rank Vision pages + optionally query museum collection API.
    const ranked = rankPages(web.pagesWithMatchingImages ?? [], museumHost);
    console.log("[identify] step 2 — ranked candidates:",
      ranked.map((r) => `${r.priority}:${r.host}${r.hasImageMatch ? "*" : ""}`));

    const museumApi = resolveMuseumApi(museum);
    if (museumApi && entities.length > 0) {
      const query = encodeURIComponent(entities.slice(0, 3).join(" "));
      try {
        const apiResp = await fetch(museumApi + query, { headers: { accept: "application/json" } });
        if (apiResp.ok) {
          const apiJson = await apiResp.json();
          console.log("[identify] museum collection API responded ok for", museum);
          // We don't parse per-museum shapes here; the museum website result
          // via ranked pages usually surfaces the same records with richer HTML.
          void apiJson;
        }
      } catch (err) {
        console.warn("[identify] museum API call failed", err instanceof Error ? err.message : err);
      }
    }

    // Prefetch homepage description for museum host so we can detect
    // sitewide-boilerplate og:descriptions in Gate 2c.
    const homepageDesc: Record<string, string | null> = {};
    async function getHomepageDesc(host: string): Promise<string | null> {
      if (host in homepageDesc) return homepageDesc[host];
      const html = await fetchHtml(`https://${host}/`, 5000);
      const d = html ? (metaContent(html, "og:description") || metaContent(html, "description")) : "";
      homepageDesc[host] = d || null;
      return homepageDesc[host];
    }

    // STEP 3 + 5: verify each candidate; collect passing sources.
    const passing: PassingSource[] = [];
    const unstructuredNeedingLLM: { source: Omit<PassingSource, "fields">; text: string }[] = [];

    for (const cand of ranked) {
      const html = await fetchHtml(cand.url);
      if (!html) continue;

      // Gate 1
      const matchUrls = [
        ...(cand.page.fullMatchingImages ?? []).map((i) => i.url).filter(Boolean) as string[],
        ...(cand.page.partialMatchingImages ?? []).map((i) => i.url).filter(Boolean) as string[],
      ];
      const g1 = gate1(html, matchUrls);
      if (g1 === false && cand.priority === "other") {
        console.log("[identify] gate1 fail (other-tier)", cand.url);
        continue; // for untrusted tier a failed identity gate is disqualifying
      }
      // For museum/trusted tier a failed image match downgrades but does not
      // outright block (real-photo case). g1 === null means not applicable.

      // Gate 2
      const homeDesc = await getHomepageDesc(cand.host);
      const g2 = await gate2(html, cand.url, homeDesc);
      if (g2 === false) continue;

      if (g2.structured) {
        passing.push({
          url: cand.url, host: cand.host, priority: cand.priority,
          structured: true, fields: g2.fields,
        });
      } else {
        unstructuredNeedingLLM.push({
          source: { url: cand.url, host: cand.host, priority: cand.priority, structured: false },
          text: g2.text,
        });
      }

      // Fast path: a museum-domain structured hit is enough on its own.
      if (passing.some((p) => p.priority === "museum" && p.structured)) break;
    }

    // Run LLM extraction for unstructured passing pages (cap at 3 to keep it cheap).
    for (const u of unstructuredNeedingLLM.slice(0, 3)) {
      try {
        const fields = await extractWithDeepSeek(deepseekKey, {
          museum, location, pageText: u.text, pageUrl: u.source.url,
        });
        if (fields.title || fields.artist) {
          passing.push({ ...u.source, fields });
        }
      } catch (err) {
        console.warn("[identify] deepseek error on", u.source.url, err instanceof Error ? err.message : err);
      }
    }

    console.log("[identify] step 4 — passing sources:", passing.length);

    // STEP 4: cross-validate.
    if (passing.length === 0) {
      // STEP 6: no-match fallback (no AI guessing).
      console.log("[identify] step 6 — no match; returning fallback");
      return json(200, {
        title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
        confident: false, source: "no-match", sourceUrl: null,
      });
    }

    const { fields, confident, primary, conflicts } = crossValidate(passing);
    if (conflicts.length) console.log("[identify] conflicts:", conflicts);

    if (!confident) {
      console.log("[identify] step 6 — insufficient corroboration; returning fallback");
      return json(200, {
        title: FALLBACK, artist: FALLBACK, year: FALLBACK, medium: FALLBACK,
        confident: false, source: "insufficient-corroboration",
        sourceUrl: primary?.url ?? null, conflicts,
      });
    }

    console.log("[identify] done", { confident, sourceUrl: primary?.url, ...fields });
    return json(200, {
      ...fields,
      confident: true,
      source: "vision+verify",
      sourceUrl: primary?.url ?? null,
      sources: passing.map((s) => ({ url: s.url, host: s.host, priority: s.priority, structured: s.structured })),
      conflicts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[identify] pipeline failed:", msg);
    return json(500, { error: msg });
  }
});
