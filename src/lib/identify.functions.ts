import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { identifyArtwork } from "./identify.server";

export const identifyArtworkFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        imageBase64: z.string().min(10).max(8_000_000),
        mimeType: z.string().max(50).default("image/jpeg"),
        museumContext: z.string().max(300).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.NEW_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) throw new Error("AI not configured");
    const visionKey = process.env.VISION_API_KEY || undefined;
    return identifyArtwork(key, visionKey, data.imageBase64, data.mimeType, data.museumContext);
  });
