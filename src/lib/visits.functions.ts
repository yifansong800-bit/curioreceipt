import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const uuid = z.string().uuid();

async function resolveMuseumLocationInternal(
  museum: string,
): Promise<{ city: string | null; country: string | null }> {
  const trimmed = museum.trim();
  if (trimmed.length < 3) return { city: null, country: null };
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { city: null, country: null };

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      output: Output.object({
        schema: z.object({
          confident: z.boolean(),
          city: z.string().nullable(),
          country: z.string().nullable(),
        }),
      }),
      prompt:
        "You identify the location of museums and art institutions. " +
        `The user entered: "${trimmed}". ` +
        "Return the city and country where this museum is located. " +
        "Use the common English city name (e.g. 'New York', 'Paris', 'Tokyo') " +
        "and the full English country name (e.g. 'United States', 'France', 'Japan'). " +
        "If you are not confident this is a real, uniquely identifiable museum, " +
        "set confident=false and city=null and country=null. Never guess.",
    });
    const out = output;
    if (!out?.confident) return { city: null, country: null };
    return {
      city: out.city?.trim() || null,
      country: out.country?.trim() || null,
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      return { city: null, country: null };
    }
    console.error("resolveMuseumLocation failed", err);
    return { city: null, country: null };
  }
}

export const resolveMuseumLocation = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ museum: z.string().trim().min(1).max(120) }).parse(raw),
  )
  .handler(async ({ data }) => resolveMuseumLocationInternal(data.museum));

export const suggestMuseums = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ query: z.string().trim().min(2).max(120) }).parse(raw),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { suggestions: [] as Array<{ name: string; city: string | null; country: string | null }> };
    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        output: Output.object({
          schema: z.object({
            suggestions: z
              .array(
                z.object({
                  name: z.string(),
                  city: z.string().nullable(),
                  country: z.string().nullable(),
                }),
              )
              .max(6),
          }),
        }),
        prompt:
          "You autocomplete real, existing museum and art institution names worldwide. " +
          `User is typing: "${data.query}". ` +
          "Return up to 6 real museums whose official English name best matches this prefix or fuzzy match. " +
          "Prefer well-known institutions. Include small/regional museums only if they clearly match. " +
          "For each: 'name' is the museum's canonical English name; 'city' is the common English city name " +
          "(e.g. 'New York', 'Paris'); 'country' is the full English country name (e.g. 'United States', 'France'). " +
          "If unsure of a location, set that field to null. Never invent museums that don't exist. " +
          "If nothing plausibly matches, return an empty array.",
      });
      const list = output?.suggestions ?? [];
      // dedupe by name+city
      const seen = new Set<string>();
      const dedup = list.filter((s) => {
        const k = `${s.name.toLowerCase()}|${(s.city ?? "").toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { suggestions: dedup };
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) return { suggestions: [] };
      console.error("suggestMuseums failed", err);
      return { suggestions: [] };
    }
  });

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

    const { city, country } = await resolveMuseumLocationInternal(data.museum);

    const { data: row, error } = await supabaseAdmin
      .from("visits")
      .insert({
        session_id: data.sessionId,
        visitor_name: data.visitorName,
        museum: data.museum,
        session_number: sessionNumber,
        city,
        country,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateVisitLocation = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        sessionId: uuid,
        visitId: uuid,
        city: z.string().trim().max(80).nullable(),
        country: z.string().trim().max(80).nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("visits")
      .update({
        city: data.city || null,
        country: data.country || null,
      })
      .eq("id", data.visitId)
      .eq("session_id", data.sessionId)
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

    const bucket = supabaseAdmin.storage.from("artwork-photos");
    const withUrls = await Promise.all(
      (artworks ?? []).map(async (a) => {
        if (!a.image_url) return a;
        if (a.image_url.startsWith("http")) return a;
        const { data: signed } = await bucket.createSignedUrl(a.image_url, 60 * 60);
        return { ...a, image_url: signed?.signedUrl ?? "" };
      }),
    );
    return { ...visit, artworks: withUrls };
  });
