import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  categoryFor,
  profileSchema,
  snapshotSchema,
  type CollectionEntry,
} from "./collection-model";
const uuid = z.string().uuid();
export const getCollection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [entries, profile, bookmarks] = await Promise.all([
      context.supabase
        .from("collection_entries")
        .select("*")
        .order("created_at", { ascending: false }),
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("museum_bookmarks")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    if (entries.error || profile.error || bookmarks.error)
      throw new Error("I couldn’t open your collection.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const resolved = await Promise.all(
      (entries.data ?? []).map(async (e) => {
        const snapshot = snapshotSchema.parse(e.snapshot);
        const artworks = await Promise.all(
          snapshot.artworks.map(async (p) => {
            if (!p.image_url) return p;
            if (!p.image_url.startsWith(`${context.userId}/`)) return { ...p, image_url: null };
            const { data } = await supabaseAdmin.storage
              .from("collection-media")
              .createSignedUrl(p.image_url, 3600);
            return { ...p, image_url: data?.signedUrl ?? null };
          }),
        );
        return { ...e, snapshot: { ...snapshot, artworks } } as CollectionEntry;
      }),
    );
    let avatarUrl: string | null = null;
    if (profile.data?.avatar_path?.startsWith(`${context.userId}/`)) {
      const { data } = await supabaseAdmin.storage
        .from("collection-media")
        .createSignedUrl(profile.data.avatar_path, 3600);
      avatarUrl = data?.signedUrl ?? null;
    }
    return { entries: resolved, profile: profile.data, bookmarks: bookmarks.data ?? [], avatarUrl };
  });
export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => profileSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, ...data });
    if (error)
      throw new Error(
        error.code === "23505"
          ? "That username is taken. Try another?"
          : "I couldn’t save your profile.",
      );
    return { ok: true };
  });
export const importGuestVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        visitId: uuid,
        sessionId: uuid,
        status: z.enum(["draft", "saved"]),
        ink: z.enum(["bw", "color"]).default("bw"),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: visit, error } = await supabaseAdmin
      .from("visits")
      .select("*")
      .eq("id", data.visitId)
      .eq("session_id", data.sessionId)
      .maybeSingle();
    if (error || !visit) throw new Error("That visit isn’t yours.");
    const { data: existing } = await supabaseAdmin
      .from("collection_entries")
      .select("user_id")
      .eq("guest_visit_id", data.visitId)
      .maybeSingle();
    if (existing && existing.user_id !== context.userId)
      throw new Error("That visit already belongs to another collection.");
    const { data: pieces, error: pe } = await supabaseAdmin
      .from("artworks")
      .select("*")
      .eq("visit_id", visit.id);
    if (pe) throw new Error("I couldn’t open that piece.");
    if (data.status === "saved" && (!pieces?.length || !pieces[0]?.title.trim()))
      throw new Error("Your piece needs a title.");
    const artworks = await Promise.all(
      (pieces ?? []).map(async (p) => {
        let path: string | null = null;
        if (p.image_url) {
          if (!p.image_url.startsWith(`${visit.id}/`)) throw new Error("Invalid photo.");
          const { data: blob, error: download } = await supabaseAdmin.storage
            .from("artwork-photos")
            .download(p.image_url);
          if (download || !blob) throw new Error("I couldn’t copy the photo.");
          path = `${context.userId}/${visit.id}/${p.id}.jpg`;
          const { error: upload } = await supabaseAdmin.storage
            .from("collection-media")
            .upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (upload) throw new Error("I couldn’t keep the photo.");
        }
        return {
          id: p.id,
          position: p.position,
          image_url: path,
          title: p.title,
          artist: p.artist,
          year: p.year,
          medium: p.medium,
          linger_seconds: p.linger_seconds,
          emotions: p.emotions,
          rating: Number(p.rating),
          note: p.note,
          palette: p.palette,
        };
      }),
    );
    const snapshot = snapshotSchema.parse({ ...visit, artworks });
    const { data: row, error: save } = await supabaseAdmin
      .from("collection_entries")
      .upsert(
        {
          user_id: context.userId,
          guest_visit_id: visit.id,
          status: data.status,
          ink: data.ink,
          snapshot,
          category: categoryFor(artworks[0]?.medium ?? ""),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guest_visit_id" },
      )
      .select("id")
      .single();
    if (save) throw new Error("I couldn’t save to your Library.");
    return row;
  });
export const editCollectionPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: uuid,
        title: z.string().trim().min(1).max(120),
        artist: z.string().max(120),
        year: z.string().max(20),
        medium: z.string().max(80),
        note: z.string().max(48),
        category: z.enum(["Contemporary", "Painting", "Photography", "Sculpture", "Uncategorized"]),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: entry, error } = await context.supabase
      .from("collection_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !entry) throw new Error("Visit not found");
    const snapshot = snapshotSchema.parse(entry.snapshot);
    const piece = snapshot.artworks[0];
    if (!piece) throw new Error("Finish this draft first.");
    const next = snapshotSchema.parse({ ...snapshot, artworks: [{ ...piece, ...data }] });
    const { error: save } = await context.supabase
      .from("collection_entries")
      .update({ snapshot: next, category: data.category, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (save) throw new Error("I couldn’t save your changes.");
    return { ok: true };
  });
export const resumeCollectionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: uuid }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: entry } = await context.supabase
      .from("collection_entries")
      .select("guest_visit_id")
      .eq("id", data.id)
      .single();
    if (!entry?.guest_visit_id) throw new Error("Draft not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: visit } = await supabaseAdmin
      .from("visits")
      .select("session_id")
      .eq("id", entry.guest_visit_id)
      .single();
    if (!visit) throw new Error("Draft not found");
    return { visitId: entry.guest_visit_id, sessionId: visit.session_id };
  });
export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(140),
        city: z.string().nullable(),
        country: z.string().nullable(),
        remove: z.boolean(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const q = data.remove
      ? context.supabase.from("museum_bookmarks").delete().eq("name", data.name)
      : context.supabase
          .from("museum_bookmarks")
          .upsert(
            { user_id: context.userId, name: data.name, city: data.city, country: data.country },
            { onConflict: "user_id,name" },
          );
    const { error } = await q;
    if (error) throw new Error("I couldn’t update your list.");
    return { ok: true };
  });
export const deleteCollectionEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: uuid }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: entry } = await context.supabase
      .from("collection_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (!entry) throw new Error("Visit not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const snapshot = snapshotSchema.parse(entry.snapshot);
    const paths = snapshot.artworks
      .map((p) => p.image_url)
      .filter((p): p is string => !!p && p.startsWith(`${context.userId}/`));
    if (paths.length) {
      const { error } = await supabaseAdmin.storage.from("collection-media").remove(paths);
      if (error) throw new Error("I couldn’t remove the photo.");
    }
    if (entry.guest_visit_id) {
      const { data: files } = await supabaseAdmin.storage
        .from("artwork-photos")
        .list(entry.guest_visit_id);
      if (files?.length)
        await supabaseAdmin.storage
          .from("artwork-photos")
          .remove(files.map((f) => `${entry.guest_visit_id}/${f.name}`));
      await supabaseAdmin.from("artworks").delete().eq("visit_id", entry.guest_visit_id);
      await supabaseAdmin.from("visits").delete().eq("id", entry.guest_visit_id);
    }
    const { error } = await context.supabase.from("collection_entries").delete().eq("id", data.id);
    if (error) throw new Error("I couldn’t delete the visit.");
    return { ok: true };
  });
export const uploadAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ base64: z.string().min(1).max(2800000) }).parse(raw))
  .handler(async ({ data, context }) => {
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (bytes.length > 2000000 || bytes[0] !== 255 || bytes[1] !== 216)
      throw new Error("Choose a JPEG photo under 2 MB.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${context.userId}/avatar.jpg`;
    const { error } = await supabaseAdmin.storage
      .from("collection-media")
      .upload(path, bytes, { upsert: true, contentType: "image/jpeg" });
    if (error) throw new Error("Photo didn’t save.");
    const { error: save } = await context.supabase
      .from("profiles")
      .update({ avatar_path: path })
      .eq("id", context.userId);
    if (save) throw new Error("Photo didn’t save.");
    return { ok: true };
  });
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: entries, error } = await context.supabase.from("collection_entries").select("*");
    if (error) throw new Error("I couldn’t delete the account.");
    for (const e of entries ?? []) {
      const snap = snapshotSchema.parse(e.snapshot);
      const paths = snap.artworks
        .map((p) => p.image_url)
        .filter((p): p is string => !!p && p.startsWith(`${context.userId}/`));
      if (paths.length) {
        const { error: remove } = await supabaseAdmin.storage
          .from("collection-media")
          .remove(paths);
        if (remove) throw new Error("Photo deletion failed. Please retry.");
      }
      if (e.guest_visit_id) {
        const { data: files, error: listError } = await supabaseAdmin.storage
          .from("artwork-photos")
          .list(e.guest_visit_id);
        if (listError) throw new Error("Photo deletion failed.");
        if (files?.length) {
          const { error: remove } = await supabaseAdmin.storage
            .from("artwork-photos")
            .remove(files.map((f) => `${e.guest_visit_id}/${f.name}`));
          if (remove) throw new Error("Photo deletion failed.");
        }
        const { error: a } = await supabaseAdmin
          .from("artworks")
          .delete()
          .eq("visit_id", e.guest_visit_id);
        const { error: v } = await supabaseAdmin.from("visits").delete().eq("id", e.guest_visit_id);
        if (a || v) throw new Error("Visit deletion failed.");
      }
    }
    await supabaseAdmin.storage.from("collection-media").remove([`${context.userId}/avatar.jpg`]);
    const { error: c } = await context.supabase
      .from("collection_entries")
      .delete()
      .eq("user_id", context.userId);
    const { error: b } = await context.supabase
      .from("museum_bookmarks")
      .delete()
      .eq("user_id", context.userId);
    if (c || b) throw new Error("Collection deletion failed.");
    const { error: del } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (del) throw new Error("Account deletion failed. Please retry.");
    return { ok: true };
  });
