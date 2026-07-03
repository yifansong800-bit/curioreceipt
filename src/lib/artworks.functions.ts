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
    const position = (count ?? 0) + 1;

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
