import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


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

const IDENTIFY_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IDENTIFY_BASE64 = Math.ceil((4 * 1024 * 1024 * 4) / 3) + 32;


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
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error("identifyArtwork: GEMINI_API_KEY not configured");
      return empty;
    }
    if (!IDENTIFY_ALLOWED_MIME.has(data.mimeType)) return empty;

    const museumName = (data.museum ?? "").trim() || "a museum";
    const prompt = `Identify the exact artwork title, artist, medium of artwork and date of artwork created for this piece seen at ${museumName}. Respond ONLY with a compact JSON object with keys "title", "artist", "year", "medium". Use null for any field you are not confident about. Do not include any commentary, markdown, or code fences.`;

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
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
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
          signal: abort.signal,
        },
      );
      if (!resp.ok) {
        console.error("identifyArtwork: Gemini error", resp.status, await resp.text());
        return empty;
      }
      const payload = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
      if (!cleaned) return empty;

      let parsed: { title?: unknown; artist?: unknown; year?: unknown; medium?: unknown };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.error("identifyArtwork: could not parse Gemini JSON", cleaned.slice(0, 200));
        return empty;
      }

      const clean = (v: unknown): string | null => {
        if (typeof v !== "string") return null;
        const t = v.trim();
        if (!t || /^(null|unknown|n\/a|none)$/i.test(t)) return null;
        return t.length > 200 ? t.slice(0, 200) : t;
      };
      const title = clean(parsed.title);
      const artist = clean(parsed.artist);
      const year = clean(parsed.year);
      const medium = clean(parsed.medium);

      if (!title || !artist) return empty;
      return { confident: true, title, artist, year, medium };
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error("identifyArtwork failed", err instanceof Error ? err.message : err);
      }
      return empty;
    } finally {
      clearTimeout(timeout);
    }
  });


