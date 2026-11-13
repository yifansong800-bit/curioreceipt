import { createFileRoute, Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Curio" },
      {
        name: "description",
        content:
          "Read how Curio handles your photos, visit data, and privacy when you create museum visit receipts.",
      },
      { property: "og:title", content: "Privacy Policy — Curio" },
      {
        property: "og:description",
        content:
          "Read how Curio handles your photos, visit data, and privacy when you create museum visit receipts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: "var(--paper)",
        color: "var(--ink)",
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <main
        className="flex-1 w-full max-w-2xl mx-auto px-6 py-10 sm:py-14"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <Link
          to="/"
          className="text-xs uppercase tracking-widest underline"
          style={{ color: "var(--ink-soft)" }}
        >
          ← Back to Curio
        </Link>

        <h1
          className="mt-8"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 8vw, 48px)",
            lineHeight: 1.1,
            letterSpacing: 2,
          }}
        >
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
          Effective Date: November 13, 2026
        </p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed">
          <section>
            <h2
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--ink-soft)" }}
            >
              1. Data We Collect (And Why)
            </h2>
            <p className="mb-3">
              Welcome to Curio. We respect your privacy and believe in absolute transparency.
              This Privacy Policy explains how we handle your data when you use our web app to turn
              your artwork photos into custom receipt designs.
            </p>
            <p>We keep things incredibly light. We only collect the minimal amount of information required to make the app work:</p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>
                <strong>Uploaded Photos:</strong> We process the photo you upload solely to apply
                our dither filter and render your final receipt graphic. When you request identification, a resized photo is sent to Anthropic, and optionally Google Vision for label and matching-image hints.
              </li>
              <li>
                <strong>Custom Inputs:</strong> Any text you voluntarily input (such as artwork
                titles, names, timestamps, or encounter selections) is used strictly to populate the
                line items on your receipt.
              </li>
              <li>
                <strong>Technical Data:</strong> We may look at basic, anonymous usage metrics
                (like page views or error logs) through our hosting provider to ensure the app is
                running smoothly and bug-free.
              </li>
            </ul>
          </section>

          <section>
            <h2
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--ink-soft)" }}
            >
              2. How Your Images Are Processed
            </h2>
            <p>
              Your photos belong to you. Photos and visit details are stored privately to support receipt creation and your collection. Account visits are visible only to their owner; other people see them only when you share an exported image. Guest receipts are protected by a device-held session identifier. Drafts may be stored on your device, including while offline.
            </p>
          </section>

          <section>
            <h2
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--ink-soft)" }}
            >
              3. Third-Party Sharing
            </h2>
            <p>
              We do not sell your personal data. Lovable Cloud hosts accounts, photos and visit data. Anthropic receives photos you ask Curio to identify; Google Vision may receive the same photo for additional evidence. These providers process data under their own terms and privacy policies. Sharing a receipt sends its image to the app or person you choose.
            </p>
          </section>

          <section>
            <h2
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--ink-soft)" }}
            >
              4. Cookies and Analytics
            </h2>
            <p>
              We do not use tracking cookies or aggressive cross-site advertising pixels. If we use
              basic analytics to count how many people are using Curio, that data is completely
              anonymized and stripped of any personal identifiers.
            </p>
          </section>

          <section>
            <h2
              className="text-xs uppercase tracking-widest mb-3"
              style={{ color: "var(--ink-soft)" }}
            >
              5. Your Rights & Control
            </h2>
            <p>
              You can edit or delete account visits from your collection and delete your account in Profile → Settings. Account deletion removes your profile, linked visit data, photos and bookmarks. Downloaded or shared images remain on devices or services where you saved them. Profile information includes your username, display name, optional photo and preferences. Location is museum-level only, not a record of your precise movements.
            </p>
          </section>

          <p className="pt-4" style={{ color: "var(--ink-soft)" }}>
            Keep art in the day. Thank you for using Curio.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
