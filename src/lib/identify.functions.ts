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
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI not configured");
    return identifyArtwork(key, data.imageBase64, data.mimeType, data.museumContext);
  });
