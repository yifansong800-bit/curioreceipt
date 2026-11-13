import { test, expect } from "bun:test";
import {
  pieceSchema,
  snapshotSchema,
  profileSchema,
  categoryFor,
  collectionStats,
} from "./collection-model";
const piece = {
  id: "piece",
  position: 1,
  image_url: null,
  title: "The Lovers II",
  artist: "René Magritte",
  year: "1928",
  medium: "Oil on canvas",
  linger_seconds: 10,
  emotions: ["moved"],
  rating: 3.5,
  note: "",
};
test("receipt requires a title", () => {
  expect(pieceSchema.safeParse({ ...piece, title: " " }).success).toBe(false);
});
test("one artwork per receipt", () => {
  expect(
    snapshotSchema.safeParse({
      museum: "The Met",
      visitor_name: "Cassie",
      created_at: "2026-11-13",
      session_number: 1,
      artworks: [piece, piece],
    }).success,
  ).toBe(false);
});
test("half-star ratings are accepted", () => {
  expect(pieceSchema.parse(piece).rating).toBe(3.5);
  expect(pieceSchema.safeParse({ ...piece, rating: 3.25 }).success).toBe(false);
});
test("username is normalized and valid", () => {
  expect(profileSchema.parse({ username: "Cassie_29", display_name: "Cassie" }).username).toBe(
    "cassie_29",
  );
  expect(profileSchema.safeParse({ username: "a", display_name: "Cassie" }).success).toBe(false);
});
test("medium categorization avoids guessing unknown genres", () => {
  expect(categoryFor("Oil on canvas")).toBe("Painting");
  expect(categoryFor("Unknown")).toBe("Uncategorized");
});
test("drafts do not count as completed visits", () => {
  const base = {
    id: "1",
    guest_visit_id: null,
    category: "Painting",
    ink: "bw",
    created_at: "2026-11-13",
    updated_at: "2026-11-13",
    snapshot: {
      museum: "The Met",
      visitor_name: "Cassie",
      created_at: "2026-11-13",
      session_number: 1,
      artworks: [piece],
    },
  };
  expect(
    collectionStats([
      { ...base, status: "draft" },
      { ...base, id: "2", status: "saved" },
    ]).visits,
  ).toBe(1);
});
