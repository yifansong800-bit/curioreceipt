import { afterEach, expect, test, mock } from "bun:test";
import { identifyArtwork } from "./identify.server";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("Anthropic identifies the photo even when Vision denies access", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    if (String(url).includes("vision.googleapis.com")) return new Response("", { status: 403 });
    return Response.json({ content: [{ type: "text", text: JSON.stringify({ title: "The Lovers II", artist: "René Magritte", year: "1928", medium: "Oil on canvas", confident: true }) }], stop_reason: "end_turn" });
  }) as typeof fetch;
  const result = await identifyArtwork("test-key", "vision-test", "image-data", "image/jpeg", "The Met");
  expect(result.title).toBe("The Lovers II");
  expect(result.confident).toBe(true);
  expect(calls.map((c) => c.url)).toEqual([
    "https://vision.googleapis.com/v1/images:annotate?key=vision-test",
    "https://api.anthropic.com/v1/messages",
  ]);
  expect(calls[1]?.body.model).toBe("claude-haiku-4-5");
});

test("a rejected Anthropic key ends the request without Gemini fallback", async () => {
  const fetchMock = mock(async () => new Response("", { status: 401 }));
  globalThis.fetch = fetchMock as typeof fetch;
  await expect(identifyArtwork("test-key", undefined, "image-data", "image/jpeg", "")).rejects.toThrow("Anthropic 401");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});