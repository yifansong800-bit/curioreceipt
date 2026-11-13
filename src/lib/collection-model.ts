import { z } from "zod";
export const categories = [
  "Contemporary",
  "Painting",
  "Photography",
  "Sculpture",
  "Uncategorized",
] as const;
export const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "Use 3–24 letters, numbers or underscores"),
  display_name: z.string().trim().min(1).max(80),
  preferences: z.record(z.string(), z.string()).default({}),
  onboarded: z.boolean().default(true),
});
export const pieceSchema = z.object({
  id: z.string(),
  position: z.number().int().min(1).max(1),
  image_url: z.string().nullable(),
  title: z.string().trim().min(1, "Your piece needs a title").max(120),
  artist: z.string().max(120),
  year: z.string().max(20),
  medium: z.string().max(80),
  linger_seconds: z.number().int().min(-1).max(43200),
  emotions: z.array(z.string().max(40)).max(12),
  rating: z.number().min(0).max(5).multipleOf(0.5),
  note: z.string().max(48),
  palette: z.array(z.string()).optional(),
});
export const snapshotSchema = z.object({
  museum: z.string().min(1).max(120),
  visitor_name: z.string().max(80),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  created_at: z.string(),
  session_number: z.number(),
  artworks: z.array(pieceSchema).max(1),
});
export type VisitSnapshot = z.infer<typeof snapshotSchema>;
export type CollectionEntry = {
  id: string;
  guest_visit_id: string | null;
  category: string;
  status: string;
  ink: "bw" | "color";
  snapshot: VisitSnapshot;
  created_at: string;
  updated_at: string;
};
export function categoryFor(medium: string) {
  const m = medium.toLowerCase();
  if (/photo/.test(m)) return "Photography";
  if (/sculpt|bronze|marble/.test(m)) return "Sculpture";
  if (/oil|canvas|watercolor|acrylic|painting/.test(m)) return "Painting";
  if (/install|digital|mixed media/.test(m)) return "Contemporary";
  return "Uncategorized";
}
export function collectionStats(entries: CollectionEntry[]) {
  const saved = entries.filter((e) => e.status === "saved");
  const works = saved.flatMap((e) => e.snapshot.artworks);
  const rated = works.filter((p) => p.rating > 0);
  const top = (values: string[]) =>
    Object.entries(
      values
        .filter(Boolean)
        .reduce<Record<string, number>>((a, v) => ({ ...a, [v]: (a[v] ?? 0) + 1 }), {}),
    ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  return {
    visits: saved.length,
    museums: [...new Set(saved.map((e) => e.snapshot.museum))],
    average: rated.length ? rated.reduce((sum, p) => sum + p.rating, 0) / rated.length : 0,
    artist: top(works.map((p) => p.artist)),
    category: top(saved.map((e) => e.category)),
  };
}
