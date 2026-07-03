import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const uuid = z.string().uuid();

type MuseumSuggestion = { name: string; city: string | null; country: string | null };

type KnownMuseum = MuseumSuggestion & { aliases?: string[] };

const knownMuseums: KnownMuseum[] = [
  { name: "Louvre Museum", city: "Paris", country: "France", aliases: ["the louvre", "musee du louvre", "musée du louvre"] },
  { name: "The Metropolitan Museum of Art", city: "New York", country: "United States", aliases: ["the met", "met museum", "metropolitan museum"] },
  { name: "Museum of Modern Art", city: "New York", country: "United States", aliases: ["moma", "mo ma"] },
  { name: "Solomon R. Guggenheim Museum", city: "New York", country: "United States", aliases: ["guggenheim", "guggenheim museum"] },
  { name: "Whitney Museum of American Art", city: "New York", country: "United States", aliases: ["the whitney", "whitney museum"] },
  { name: "The Art Institute of Chicago", city: "Chicago", country: "United States", aliases: ["art institute chicago", "aic"] },
  { name: "The Getty Center", city: "Los Angeles", country: "United States", aliases: ["getty", "getty center", "j paul getty museum"] },
  { name: "San Francisco Museum of Modern Art", city: "San Francisco", country: "United States", aliases: ["sfmoma", "sf moma"] },
  { name: "National Gallery of Art", city: "Washington", country: "United States", aliases: ["nga", "national gallery washington"] },
  { name: "British Museum", city: "London", country: "United Kingdom", aliases: ["the british museum"] },
  { name: "Tate Modern", city: "London", country: "United Kingdom", aliases: ["the tate", "tate"] },
  { name: "Victoria and Albert Museum", city: "London", country: "United Kingdom", aliases: ["v&a", "v and a", "va museum"] },
  { name: "National Gallery", city: "London", country: "United Kingdom", aliases: ["the national gallery london"] },
  { name: "Musée d'Orsay", city: "Paris", country: "France", aliases: ["musee d'orsay", "orsay museum", "musee orsay"] },
  { name: "Centre Pompidou", city: "Paris", country: "France", aliases: ["pompidou", "centre georges pompidou"] },
  { name: "Rijksmuseum", city: "Amsterdam", country: "Netherlands", aliases: ["rijks museum"] },
  { name: "Van Gogh Museum", city: "Amsterdam", country: "Netherlands", aliases: ["vangogh museum"] },
  { name: "Uffizi Gallery", city: "Florence", country: "Italy", aliases: ["the uffizi", "gallerie degli uffizi"] },
  { name: "Vatican Museums", city: "Vatican City", country: "Vatican City", aliases: ["vatican museum", "musei vaticani"] },
  { name: "Prado Museum", city: "Madrid", country: "Spain", aliases: ["museo del prado", "the prado"] },
  { name: "Museo Reina Sofía", city: "Madrid", country: "Spain", aliases: ["reina sofia", "reina sofía", "museo reina sofia"] },
  { name: "Pergamon Museum", city: "Berlin", country: "Germany", aliases: ["pergamonmuseum"] },
  { name: "Acropolis Museum", city: "Athens", country: "Greece", aliases: ["the acropolis museum"] },
  { name: "Tokyo National Museum", city: "Tokyo", country: "Japan", aliases: ["tnm"] },
  { name: "National Museum of Modern and Contemporary Art", city: "Seoul", country: "South Korea", aliases: ["mmca", "mmca korea"] },
  { name: "National Palace Museum", city: "Taipei", country: "Taiwan", aliases: ["taipei national palace museum"] },
  { name: "The Palace Museum", city: "Beijing", country: "China", aliases: ["forbidden city museum", "palace museum beijing"] },
  { name: "National Gallery Singapore", city: "Singapore", country: "Singapore", aliases: ["national gallery of singapore"] },
  { name: "Museum of Contemporary Art Australia", city: "Sydney", country: "Australia", aliases: ["mca australia", "mca sydney"] },
  { name: "National Gallery of Victoria", city: "Melbourne", country: "Australia", aliases: ["ngv"] },
  { name: "Frida Kahlo Museum", city: "Mexico City", country: "Mexico", aliases: ["casa azul", "blue house museum"] },
  { name: "Museo Nacional de Antropología", city: "Mexico City", country: "Mexico", aliases: ["national museum of anthropology mexico", "museo nacional de antropologia"] },
];

const museumSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(140),
  city: z.string().trim().min(1).max(80).nullable(),
  country: z.string().trim().min(1).max(80).nullable(),
});

const museumSuggestionsSchema = z.object({
  suggestions: z.array(museumSuggestionSchema).max(6),
});

const museumLocationSchema = z.object({
  confident: z.boolean(),
  city: z.string().trim().min(1).max(80).nullable(),
  country: z.string().trim().min(1).max(80).nullable(),
});

function normalizeMuseumText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function candidatesForMuseum(museum: KnownMuseum) {
  return [museum.name, ...(museum.aliases ?? [])].map(normalizeMuseumText).filter(Boolean);
}

function scoreKnownMuseum(query: string, museum: KnownMuseum) {
  const q = normalizeMuseumText(query);
  if (!q) return 0;
  const tokens = q.split(" ").filter(Boolean);
  let best = 0;
  for (const candidate of candidatesForMuseum(museum)) {
    if (candidate === q) best = Math.max(best, 100);
    else if (candidate.startsWith(q)) best = Math.max(best, 90);
    else if (candidate.includes(q)) best = Math.max(best, 75);
    else if (tokens.every((token) => candidate.includes(token))) best = Math.max(best, 55 + tokens.length);
  }
  return best;
}

function localMuseumSuggestions(query: string): MuseumSuggestion[] {
  return knownMuseums
    .map((museum) => ({ museum, score: scoreKnownMuseum(query, museum) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.museum.name.localeCompare(b.museum.name))
    .slice(0, 6)
    .map(({ museum }) => ({ name: museum.name, city: museum.city, country: museum.country }));
}

function findKnownMuseum(query: string) {
  const [best] = knownMuseums
    .map((museum) => ({ museum, score: scoreKnownMuseum(query, museum) }))
    .filter(({ score }) => score >= 75)
    .sort((a, b) => b.score - a.score);
  return best?.museum ?? null;
}

function dedupeSuggestions(list: MuseumSuggestion[]) {
  const seen = new Set<string>();
  const out: MuseumSuggestion[] = [];
  for (const item of list) {
    const parsed = museumSuggestionSchema.safeParse(item);
    if (!parsed.success) continue;
    const suggestion = parsed.data;
    const key = `${normalizeMuseumText(suggestion.name)}|${normalizeMuseumText(suggestion.city ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
    if (out.length >= 6) break;
  }
  return out;
}

function parseJsonObject<T>(text: string, schema: z.ZodType<T>): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return schema.parse(JSON.parse(source.slice(start, end + 1)));
  } catch {
    return null;
  }
}

async function generateJsonObject<T>(schema: z.ZodType<T>, prompt: string, timeoutMs = 2500): Promise<T | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      temperature: 0,
      maxOutputTokens: 700,
      abortSignal: abort.signal,
      prompt: `${prompt}\n\nReturn ONLY valid JSON. Do not wrap it in markdown.`,
    });
    return parseJsonObject(text, schema);
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error("Museum AI lookup failed", err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveMuseumLocationInternal(
  museum: string,
): Promise<{ city: string | null; country: string | null }> {
  const trimmed = museum.trim();
  if (trimmed.length < 3) return { city: null, country: null };
  const known = findKnownMuseum(trimmed);
  if (known) return { city: known.city, country: known.country };

  const out = await generateJsonObject(
    museumLocationSchema,
    "You identify the location of museums and art institutions. " +
      `The user entered: "${trimmed}". ` +
      "Return a JSON object with keys confident, city, and country. " +
      "Use the common English city name (e.g. 'New York', 'Paris', 'Tokyo') " +
      "and the full English country name (e.g. 'United States', 'France', 'Japan'). " +
      "If you are not confident this is a real, uniquely identifiable museum, " +
      "set confident=false and city=null and country=null. Never guess.",
  );
  if (!out?.confident) return { city: null, country: null };
  return { city: out.city?.trim() || null, country: out.country?.trim() || null };
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
    const local = localMuseumSuggestions(data.query);
    const ai = await generateJsonObject(
      museumSuggestionsSchema,
      "You autocomplete real, existing museum and art institution names worldwide. " +
        `User is typing: "${data.query}". ` +
        "Return a JSON object with one key, suggestions, containing up to 6 real museums whose official English name best matches this prefix or fuzzy match. " +
        "Prefer well-known institutions. Include small/regional museums only if they clearly match. " +
        "For each suggestion: name is the museum's canonical English name; city is the common English city name " +
        "(e.g. 'New York', 'Paris'); country is the full English country name (e.g. 'United States', 'France'). " +
        "If unsure of a location, set that field to null. Never invent museums that don't exist. " +
        "If nothing plausibly matches, return {\"suggestions\":[]}.",
      1800,
    );
    return { suggestions: dedupeSuggestions([...local, ...(ai?.suggestions ?? [])]) };
  });

export const createVisit = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        sessionId: uuid,
        visitorName: z.string().trim().min(1).max(80),
        museum: z.string().trim().min(1).max(120),
        city: z.string().trim().max(80).nullable().optional(),
        country: z.string().trim().max(80).nullable().optional(),
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

    let city = data.city ?? null;
    let country = data.country ?? null;
    if (!city && !country) {
      const resolved = await resolveMuseumLocationInternal(data.museum);
      city = resolved.city;
      country = resolved.country;
    }

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
