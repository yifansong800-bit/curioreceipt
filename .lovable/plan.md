# Share receipt to Instagram

## The honest constraint

Instagram has no public web API that lets a website post directly to a user's feed or story from the browser. No third-party site can do it — not even with an API key. What we *can* do is hand the receipt PNG to the Instagram app in one tap, and let the user pick Story / Post / DM there.

Two realistic paths, combined into one button:

1. **Mobile (phone/tablet):** use the browser's built-in **Web Share API** with the PNG as a file attachment. Instagram appears in the native share sheet → tap it → IG opens with the image preloaded, ready to post to Story, Feed, or Reels. This is the same flow apps like Notion and Figma use. Works on iOS Safari 15+ and Android Chrome.
2. **Desktop / unsupported browsers:** Instagram web can't accept an image upload from another site, so we fall back to: **download the PNG + copy a caption + open instagram.com** in a new tab with a small tooltip explaining "IG doesn't allow direct posting from desktop — your receipt is saved, drag it into Instagram."

## What changes in the UI

On the final "receipt is printed" screen, next to the existing **Download** button, add a **Share** button (Instagram glyph + "Share"). The button is only enabled once the print animation finishes, same gating as Download.

Tap behavior:
- If `navigator.canShare({ files: [pngFile] })` is true → call `navigator.share(...)` with the PNG file, a short title ("My Curio receipt"), and a suggested caption. The OS share sheet appears; user picks Instagram.
- Else → download the PNG (reuse the existing export path) and open `https://www.instagram.com/` in a new tab, with a toast: "Saved to your device — drop it into an Instagram Story or Post."

No account linking, no OAuth, no secrets, no backend work. Nothing about the receipt design, animation, or data model changes.

## Technical section

- Reuse `html-to-image`'s `toBlob()` on the same receipt node used for PNG export, then wrap the blob in a `File` (`new File([blob], 'curio-receipt.png', { type: 'image/png' })`).
- Feature-detect with `navigator.canShare?.({ files: [file] })` — this is the correct check; `navigator.share` alone doesn't guarantee file support (desktop Safari has share without files).
- Suggested caption string: `"My visit to {museum} — logged on Curio ✦"`. User can edit inside Instagram.
- Add the button in `src/routes/visit.$visitId.tsx` (or wherever the current Download button lives — will confirm on implementation) alongside the Download control, matching its style. Icon: `Share2` from `lucide-react` (already in the project via shadcn).
- No new dependencies. No env vars. No Supabase changes.

## Out of scope (worth calling out)

- **Auto-posting to a user's Instagram feed:** not possible from a website. Requires the Instagram Graph API, which only works for Business/Creator accounts that have gone through Meta's app review — not viable for anonymous v1 users.
- **Pre-filling Instagram Stories with stickers:** only native iOS/Android apps can use IG's Stories deep-link (`instagram-stories://share`). A mobile web page can't trigger it reliably across iOS Safari.
- **Desktop direct-to-IG:** Instagram web upload doesn't accept programmatic file drops from another origin — the download-and-redirect fallback is the ceiling there.
