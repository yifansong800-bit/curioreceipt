import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const uuid = z.string().uuid();

export const createVisit = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        sessionId: uuid,
        visitorName: z.string().trim().min(1).max(80),
        museum: z.string().trim().min(1).max(120),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count } = await supabaseAdmin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("session_id", data.sessionId);
    const sessionNumber = (count ?? 0) + 1;

    const { data: row, error } = await supabaseAdmin
      .from("visits")
      .insert({
        session_id: data.sessionId,
        visitor_name: data.visitorName,
        museum: data.museum,
        session_number: sessionNumber,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getVisit = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) =>
    z.object({ visitId: uuid, sessionId: uuid }).parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: visit, error } = await supabaseAdmin
      .from("visits")
      .select("*")
      .eq("id", data.visitId)
      .eq("session_id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visit) return null;

    const { data: artworks, error: aerr } = await supabaseAdmin
      .from("artworks")
      .select("*")
      .eq("visit_id", data.visitId)
      .order("position", { ascending: true });
    if (aerr) throw new Error(aerr.message);

    // Turn stored storage paths into signed URLs the browser can render.
    const bucket = supabaseAdmin.storage.from("artwork-photos");
    const withUrls = await Promise.all(
      (artworks ?? []).map(async (a) => {
        if (!a.image_url) return a;
        // If it's already an http(s) URL just pass it through.
        if (a.image_url.startsWith("http")) return a;
        const { data: signed } = await bucket.createSignedUrl(a.image_url, 60 * 60);
        return { ...a, image_url: signed?.signedUrl ?? "" };
      }),
    );
    return { ...visit, artworks: withUrls };
  });
