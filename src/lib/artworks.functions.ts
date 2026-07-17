import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const uuid = z.string().uuid();

async function assertOwns(sessionId: string, visitId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("visits")
    .select("id")
    .eq("id", visitId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not found");
}

const artworkFields = z.object({
  imagePath: z.string().max(300).nullable().optional(),
  title: z.string().max(120).default(""),
  artist: z.string().max(120).default(""),
  year: z.string().max(20).default(""),
  medium: z.string().max(80).default(""),
  lingerSeconds: z.number().int().min(-1).max(60 * 60 * 12).default(-1),
  emotions: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  photoTakenAt: z.string().nullable().optional(),
  palette: z.array(z.string().max(32)).max(6).default([]),
  rating: z.number().int().min(0).max(5).default(0),
});


export const addArtwork = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({ sessionId: uuid, visitId: uuid })
      .and(artworkFields)
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await assertOwns(data.sessionId, data.visitId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .eq("visit_id", data.visitId);
    const current = count ?? 0;
    if (current >= 1) throw new Error("Artwork limit reached");
    const position = current + 1;


    const { data: row, error } = await supabaseAdmin
      .from("artworks")
      .insert({
        visit_id: data.visitId,
        session_id: data.sessionId,
        position,
        image_url: data.imagePath ?? null,
        title: data.title,
        artist: data.artist,
        year: data.year,
        medium: data.medium,
        linger_seconds: data.lingerSeconds,
        emotions: data.emotions,
        photo_taken_at: data.photoTakenAt ?? null,
        palette: data.palette,
        rating: data.rating,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateArtwork = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({ sessionId: uuid, visitId: uuid, artworkId: uuid })
      .and(artworkFields.partial())
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await assertOwns(data.sessionId, data.visitId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      title?: string;
      artist?: string;
      year?: string;
      medium?: string;
      linger_seconds?: number;
      emotions?: string[];
      rating?: number;
    } = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.artist !== undefined) patch.artist = data.artist;
    if (data.year !== undefined) patch.year = data.year;
    if (data.medium !== undefined) patch.medium = data.medium;
    if (data.lingerSeconds !== undefined) patch.linger_seconds = data.lingerSeconds;
    if (data.emotions !== undefined) patch.emotions = data.emotions;
    if (data.rating !== undefined) patch.rating = data.rating;

    const { data: row, error } = await supabaseAdmin
      .from("artworks")
      .update(patch)
      .eq("id", data.artworkId)
      .eq("visit_id", data.visitId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteArtwork = createServerFn({ method: "POST" })

  .inputValidator((raw: unknown) =>
    z
      .object({ sessionId: uuid, visitId: uuid, artworkId: uuid })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await assertOwns(data.sessionId, data.visitId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("artworks")
      .delete()
      .eq("id", data.artworkId)
      .eq("visit_id", data.visitId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB

export const uploadArtworkPhoto = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        sessionId: uuid,
        visitId: uuid,
        contentType: z.string().max(100),
        ext: z.string().regex(/^[a-zA-Z0-9]{1,8}$/),
        dataBase64: z.string().max(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 32),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    await assertOwns(data.sessionId, data.visitId);
    if (!ALLOWED_IMAGE_TYPES.has(data.contentType.toLowerCase())) {
      throw new Error("Unsupported image type");
    }
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("Invalid file size");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = `${data.visitId}/${crypto.randomUUID()}.${data.ext.toLowerCase()}`;
    const { error } = await supabaseAdmin.storage
      .from("artwork-photos")
      .upload(key, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    return { path: key };
  });

const identifySchema = z.object({
  confident: z.boolean(),
  title: z.string().nullable(),
  artist: z.string().nullable(),
  year: z.string().nullable(),
  medium: z.string().nullable(),
});

const IDENTIFY_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IDENTIFY_BASE64 = Math.ceil((4 * 1024 * 1024 * 4) / 3) + 32;

function parseIdentifyJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const src = fenced ?? text;
  const s = src.indexOf("{");
  const e = src.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) return null;
  try {
    return identifySchema.parse(JSON.parse(src.slice(s, e + 1)));
  } catch {
    return null;
  }
}

export const identifyArtwork = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        imageBase64: z.string().min(16).max(MAX_IDENTIFY_BASE64),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        museum: z.string().trim().max(160).optional(),
        city: z.string().trim().max(120).nullable().optional(),
        country: z.string().trim().max(120).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const empty = { confident: false, title: null, artist: null, year: null, medium: null };
    const visionKey = process.env.GOOGLE_VISION_API_KEY;
    if (!visionKey) {
      console.error("identifyArtwork: GOOGLE_VISION_API_KEY not configured");
      return empty;
    }
    if (!IDENTIFY_ALLOWED_MIME.has(data.mimeType)) return empty;

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(visionKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                image: { content: data.imageBase64 },
                features: [{ type: "WEB_DETECTION", maxResults: 15 }],
              },
            ],
          }),
          signal: abort.signal,
        },
      );
      if (!resp.ok) {
        console.error("identifyArtwork: Vision API error", resp.status, await resp.text());
        return empty;
      }
      const payload = (await resp.json()) as {
        responses?: Array<{
          webDetection?: {
            webEntities?: Array<{ description?: string; score?: number }>;
            bestGuessLabels?: Array<{ label?: string }>;
            pagesWithMatchingImages?: Array<{ pageTitle?: string }>;
          };
        }>;
      };
      const web = payload?.responses?.[0]?.webDetection ?? {};
      const entities = (web.webEntities ?? []).filter(
        (e) => e.description && (e.score ?? 0) > 0.3,
      );
      const bestGuess = web.bestGuessLabels?.[0]?.label ?? "";
      const pageTitles = (web.pagesWithMatchingImages ?? [])
        .map((p) => p.pageTitle ?? "")
        .filter((t) => t.length > 0);

      // Title / artist extraction
      function splitTitleArtist(text: string): { title: string | null; artist: string | null } {
        const cleaned = text.replace(/\s+[-–|·].*$/, "").trim();
        const byMatch = cleaned.match(/^(.+?)\s+by\s+(.+)$/i);
        if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
        const commaMatch = cleaned.match(/^(.+?),\s*(.+)$/);
        if (commaMatch) return { title: commaMatch[1].trim(), artist: commaMatch[2].trim() };
        return { title: cleaned || null, artist: null };
      }

      let title: string | null = null;
      let artist: string | null = null;
      if (bestGuess) {
        const parsed = splitTitleArtist(bestGuess);
        title = parsed.title;
        artist = parsed.artist;
      }
      if (!title && entities.length > 0) title = entities[0].description ?? null;
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

      // Year / medium extraction from combined text
      const corpus = [bestGuess, ...pageTitles, ...entities.map((e) => e.description ?? "")].join(" \n ");
      let year: string | null = null;
      const circa = corpus.match(/\bc\.?\s*\d{3,4}\b/i);
      const range = corpus.match(/\b(1[0-9]{3}|20[0-2][0-9])\s*[–-]\s*(1[0-9]{3}|20[0-2][0-9])\b/);
      const single = corpus.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/);
      if (circa) year = circa[0];
      else if (range) year = range[0];
      else if (single) year = single[0];

      const MEDIUMS = [
        "oil on canvas", "oil on panel", "oil on wood", "acrylic on canvas",
        "tempera on panel", "tempera on wood", "watercolor", "gouache", "fresco",
        "marble", "bronze", "sculpture", "lithograph", "etching", "engraving",
        "woodcut", "photograph", "gelatin silver print", "mixed media", "pastel",
        "charcoal", "ink on paper", "pencil on paper",
      ];
      let medium: string | null = null;
      const lower = corpus.toLowerCase();
      for (const m of MEDIUMS) {
        if (lower.includes(m)) {
          medium = m.replace(/\b\w/g, (c) => c.toUpperCase());
          break;
        }
      }

      const titleOk = !!(title && title.trim().length > 0);
      const artistOk = !!(artist && artist.trim().length > 0);
      if (!titleOk || !artistOk) return empty;

      return {
        confident: true,
        title: title!.trim(),
        artist: artist!.trim(),
        year: year ?? null,
        medium: medium ?? null,
      };
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error("identifyArtwork failed", err instanceof Error ? err.message : err);
      }
      return empty;
    } finally {
      clearTimeout(timeout);
    }
  });

