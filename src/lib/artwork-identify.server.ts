type IdentifyInput = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  museum?: string;
  city?: string | null;
  country?: string | null;
};

type IdentifyResult = {
  confident: boolean;
  title: string | null;
  artist: string | null;
  year: string | null;
  medium: string | null;
  source?: "gemini" | "vision";
  reason?: string;
};

type VisionWebEntity = { score?: number; description?: string };
type VisionPage = { url?: string; pageTitle?: string };
type VisionWebDetection = {
  webEntities?: VisionWebEntity[];
  bestGuessLabels?: Array<{ label?: string }>;
  pagesWithMatchingImages?: VisionPage[];
};

const MEDIUM_KEYWORDS = [
  "oil on canvas",
  "oil on panel",
  "oil on wood",
  "acrylic on canvas",
  "tempera on panel",
  "tempera on wood",
  "watercolor",
  "watercolour",
  "gouache",
  "fresco",
  "marble",
  "bronze",
  "ceramic",
  "porcelain",
  "sculpture",
  "installation",
  "video installation",
  "lithograph",
  "etching",
  "engraving",
  "woodcut",
  "screenprint",
  "photograph",
  "gelatin silver print",
  "chromogenic print",
  "mixed media",
  "pastel",
  "charcoal",
  "ink on paper",
  "pencil on paper",
];

const emptyIdentify = (reason?: string): IdentifyResult => ({
  confident: false,
  title: null,
  artist: null,
  year: null,
  medium: null,
  reason,
});

function cleanField(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  if (!cleaned || /^(null|unknown|n\/a|none|not available)$/i.test(cleaned)) return null;
  return cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned;
}

function finalizeIdentify(
  fields: { title?: unknown; artist?: unknown; year?: unknown; medium?: unknown },
  source: "gemini" | "vision",
): IdentifyResult {
  const title = cleanField(fields.title, 140);
  const artist = cleanField(fields.artist, 140);
  const year = cleanField(fields.year, 40);
  const medium = cleanField(fields.medium, 120);
  return {
    confident: Boolean(title && (artist || year || medium)),
    title,
    artist,
    year,
    medium,
    source,
  };
}

function parseJsonObject(text: string): { title?: unknown; artist?: unknown; year?: unknown; medium?: unknown } | null {
  const source = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function extractYear(text: string): string | null {
  const circa = text.match(/\bc\.?\s*(1[0-9]{3}|20[0-2][0-9])\b/i);
  if (circa) return circa[0].replace(/\s+/g, " ");
  const range = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\s*[–-]\s*(1[0-9]{3}|20[0-2][0-9])\b/);
  if (range) return range[0];
  const single = text.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
  return single ? single[0] : null;
}

function extractMedium(text: string): string | null {
  const lower = text.toLowerCase();
  for (const medium of MEDIUM_KEYWORDS) {
    if (lower.includes(medium)) return medium.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

function looksLikeSiteTitle(text: string): boolean {
  return /(https?:\/\/|\b(home|shop|tickets|visit|exhibition|exhibitions|collection|collections|archive|museum|gallery|foundation|official site|wikipedia)\b|博物館|美術館|藏品|展覽|展览|維基|百科|M\+)/i.test(
    text,
  );
}

function sanitizeCandidate(text: string): string | null {
  const cleaned = cleanField(text, 180);
  if (!cleaned) return null;
  const colonParts = cleaned.split(/[：:]/).map((part) => part.trim()).filter(Boolean);
  const withoutPrefix = colonParts.length > 1 && looksLikeSiteTitle(colonParts[0]) ? colonParts.slice(1).join(": ") : cleaned;
  const parts = withoutPrefix
    .split(/\s*[|｜]\s*|\s+[–—-]\s+/)
    .map((part) => cleanField(part, 140))
    .filter((part): part is string => Boolean(part));
  const best = parts.find((part) => !looksLikeSiteTitle(part)) ?? parts[0] ?? withoutPrefix;
  const candidate = cleanField(best, 140);
  if (!candidate || candidate.length < 2 || /\.(jpg|jpeg|png|webp)$/i.test(candidate)) return null;
  return candidate;
}

function isLikelyPersonName(text: string): boolean {
  const value = text.trim();
  if (/^[\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,4}$/u.test(value)) return true;
  if (/^[A-Z][a-z]+\s+[A-Z]\.\s+[A-Z][a-z]+$/.test(value)) return true;
  return false;
}

function splitTitleArtist(text: string): { title: string | null; artist: string | null } {
  const candidate = sanitizeCandidate(text);
  if (!candidate) return { title: null, artist: null };
  const byMatch = candidate.match(/^(.+?)\s+by\s+(.+)$/i);
  if (byMatch) return { title: cleanField(byMatch[1], 140), artist: cleanField(byMatch[2], 140) };
  const commaMatch = candidate.match(/^(.+?),\s*([^,]+)$/);
  if (commaMatch && isLikelyPersonName(commaMatch[2])) {
    return { title: cleanField(commaMatch[1], 140), artist: cleanField(commaMatch[2], 140) };
  }
  return { title: candidate, artist: null };
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|dt|dd|tr|td|th|h[1-6]|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function extractLabeledValue(text: string, labels: string[]): string | null {
  const lines = text
    .split("\n")
    .map((line) => cleanField(line, 180))
    .filter((line): line is string => Boolean(line));
  for (let i = 0; i < lines.length; i += 1) {
    for (const label of labels) {
      const inline = lines[i].match(new RegExp(`^${label}\\s*[:：-]?\\s*(.{2,140})$`, "i"));
      if (inline?.[1]) return cleanField(inline[1], 140);
      if (new RegExp(`^${label}$`, "i").test(lines[i]) && lines[i + 1]) return cleanField(lines[i + 1], 140);
    }
  }
  return null;
}

async function fetchPageText(url: string): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 2500);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 500_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ?? "";
    return [title, ogTitle, description, stripHtmlToText(html)].filter(Boolean).join("\n");
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseVisionWebDetection(web: VisionWebDetection, pageTexts: string[]): IdentifyResult {
  const entities = (web.webEntities ?? [])
    .filter((entity) => entity.description && (entity.score ?? 0) > 0.25)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const pageTitles = (web.pagesWithMatchingImages ?? [])
    .map((page) => page.pageTitle)
    .filter((title): title is string => Boolean(title));
  const bestGuess = web.bestGuessLabels?.[0]?.label ?? null;
  const corpus = [bestGuess ?? "", ...entities.map((entity) => entity.description ?? ""), ...pageTitles, ...pageTexts].join("\n");

  let title: string | null = null;
  let artist: string | null = null;

  for (const candidate of [bestGuess, ...entities.map((entity) => entity.description), ...pageTitles]) {
    if (!candidate) continue;
    const parsed = splitTitleArtist(candidate);
    if (!title && parsed.title && !looksLikeSiteTitle(parsed.title) && !isLikelyPersonName(parsed.title)) title = parsed.title;
    if (!artist && parsed.artist) artist = parsed.artist;
    if (title && artist) break;
  }

  if (!title) {
    const entity = entities.find((item) => {
      const candidate = sanitizeCandidate(item.description ?? "");
      return candidate && !looksLikeSiteTitle(candidate) && !isLikelyPersonName(candidate);
    });
    title = sanitizeCandidate(entity?.description ?? "");
  }

  if (!artist) {
    const entity = entities.find((item) => {
      const candidate = sanitizeCandidate(item.description ?? "");
      return candidate && candidate !== title && isLikelyPersonName(candidate);
    });
    artist = sanitizeCandidate(entity?.description ?? "");
  }

  const scrapedArtist = extractLabeledValue(corpus, ["Artist", "Artist/Maker", "Maker", "Creator", "作家", "藝術家", "艺术家"]);
  const scrapedTitle = extractLabeledValue(corpus, ["Title", "Artwork", "Work", "作品", "標題", "标题"]);
  const scrapedYear = extractLabeledValue(corpus, ["Date", "Date created", "Created", "Year", "年份", "創作日期", "创作日期"]);
  const scrapedMedium = extractLabeledValue(corpus, ["Medium", "Materials", "Material", "Classification", "媒介", "材料"]);

  const result = finalizeIdentify(
    {
      title: title ?? (scrapedTitle && !looksLikeSiteTitle(scrapedTitle) ? scrapedTitle : null),
      artist: artist ?? scrapedArtist,
      year: scrapedYear ?? extractYear(corpus),
      medium: scrapedMedium ?? extractMedium(corpus),
    },
    "vision",
  );

  return {
    ...result,
    confident: Boolean(result.title && (result.artist || (entities[0]?.score ?? 0) > 0.65)),
  };
}

async function identifyWithVision(data: IdentifyInput): Promise<IdentifyResult | null> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) return null;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 7000);
  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: data.imageBase64 },
            features: [{ type: "WEB_DETECTION", maxResults: 20 }],
          },
        ],
      }),
      signal: abort.signal,
    });
    if (!response.ok) {
      console.error("identifyArtwork: Vision fallback error", response.status, (await response.text()).slice(0, 1000));
      return null;
    }
    const payload = (await response.json()) as { responses?: Array<{ webDetection?: VisionWebDetection; error?: unknown }> };
    if (payload.responses?.[0]?.error) {
      console.error("identifyArtwork: Vision fallback response error", JSON.stringify(payload.responses[0].error).slice(0, 1000));
      return null;
    }
    const web = payload.responses?.[0]?.webDetection;
    if (!web) return null;
    const urls = (web.pagesWithMatchingImages ?? [])
      .map((page) => page.url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 2);
    const pageTexts = (await Promise.all(urls.map((url) => fetchPageText(url)))).filter((text): text is string => Boolean(text));
    return parseVisionWebDetection(web, pageTexts);
  } catch (err) {
    if (!abort.signal.aborted) console.error("identifyArtwork: Vision fallback failed", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function identifyWithGemini(data: IdentifyInput): Promise<IdentifyResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error("identifyArtwork: GEMINI_API_KEY not configured");
    return null;
  }

  const museumName = (data.museum ?? "").trim() || "the museum the visitor entered";
  const location = [data.city, data.country].filter(Boolean).join(", ");
  const prompt =
    `Identify the exact artwork title, artist, medium of artwork and date of artwork created for this piece seen at ${museumName}${location ? ` in ${location}` : ""}. ` +
    "Use the image itself and the museum context. Do not use a museum website page title, collection page title, or exhibition title as the artwork title. " +
    "Return ONLY a compact JSON object with keys title, artist, year, medium. Use null for any field you cannot identify from visual evidence and museum context.";

  const models = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-flash-latest"];
  for (const model of models) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: data.mimeType, data: data.imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 512,
              responseMimeType: "application/json",
            },
          }),
          signal: abort.signal,
        },
      );
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 1000);
        console.error("identifyArtwork: Gemini error", response.status, detail);
        if (response.status === 404 || response.status === 400) continue;
        return null;
      }
      const payload = (await response.json()) as {
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
      };
      const candidate = payload.candidates?.[0];
      const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      if (!text.trim()) {
        console.error("identifyArtwork: Gemini empty response", candidate?.finishReason ?? "unknown finish reason");
        continue;
      }
      const parsed = parseJsonObject(text);
      if (!parsed) {
        console.error("identifyArtwork: could not parse Gemini JSON", text.slice(0, 200));
        continue;
      }
      return finalizeIdentify(parsed, "gemini");
    } catch (err) {
      if (!abort.signal.aborted) console.error("identifyArtwork failed", err instanceof Error ? err.message : err);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

export async function identifyArtworkInternal(data: IdentifyInput): Promise<IdentifyResult> {
  const geminiResult = await identifyWithGemini(data);
  if (geminiResult?.confident || geminiResult?.title) return geminiResult;

  const visionResult = await identifyWithVision(data);
  if (visionResult?.title || visionResult?.artist || visionResult?.year || visionResult?.medium) return visionResult;

  return emptyIdentify("not-found");
}