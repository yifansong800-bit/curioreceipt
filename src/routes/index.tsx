import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Footer } from "@/components/Footer";
import { CurioDoodle } from "@/components/curio-doodle";
import { DemoPreview } from "@/components/demo-previews";
import type { CurioMode } from "@/components/pixel-icons";
import wordmark from "@/assets/curio-wordmark.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Curio — Print your favorite museum art piece" },
      {
        name: "description",
        content:
          "Turn your favorite piece from a museum visit into a thermal receipt keepsake. Snap it, log it, print it.",
      },
      { property: "og:title", content: "Curio — Your favorite art piece, on receipt paper" },
      {
        property: "og:description",
        content: "A printable memento of your favorite piece from every museum trip.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [demo, setDemo] = useState<CurioMode | null>(null);

  return (
    <Dialog>
      <div
        className="relative h-[100dvh] overflow-hidden flex flex-col items-center justify-center px-[max(2.25rem,env(safe-area-inset-left))]"
        style={{
          paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="About Curio"
            className="absolute z-10 inline-flex items-center justify-center rounded-full border border-ink bg-paper p-2 text-ink transition-all duration-100 hover:bg-[var(--teal)] hover:text-[var(--yellow)] active:scale-90"
            style={{
              top: "max(1rem, env(safe-area-inset-top))",
              right: "max(1rem, env(safe-area-inset-right))",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Info className="h-5 w-5" />
          </button>
        </DialogTrigger>

        <div className="w-full max-w-md -mt-10">
          <img
            src={wordmark.url}
            alt="CURIO"
            className="mx-auto block w-[62%] max-w-[280px]"
          />
          <p
            className="text-center mt-4 text-xs sm:text-sm leading-relaxed tracking-wide"
            style={{ color: "var(--ink)" }}
          >
            A pocket&nbsp; for
            <br />
            your art museum visit.
          </p>

          <div className="mt-6 -mx-3">
            <CurioDoodle onPick={setDemo} />
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => navigate({ to: "/begin" })}
              className="uppercase tracking-[0.2em] text-xs px-7 py-2.5 transition-transform duration-100 active:scale-95"
              style={{
                backgroundColor: "var(--teal)",
                color: "var(--yellow)",
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              begin
            </button>
          </div>
        </div>

        <Footer className="absolute bottom-0" />

        <DialogContent
          className="max-w-[calc(100%-4rem)] sm:max-w-md border text-left"
          style={{ borderColor: "var(--ink)", fontFamily: "var(--font-mono)" }}
        >
          <DialogTitle className="text-lg tracking-tight">About Curio</DialogTitle>
          <div className="space-y-4 text-sm sm:text-base leading-relaxed" style={{ color: "var(--ink)" }}>
            <p>
              Curio helps art lovers and casual visitors capture their favorite piece from every
              museum visit — so the one that moved you never gets lost in a camera roll or Notes
              app.
            </p>
            <p>If you love it, print it. Let's keep our favorite art close.</p>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
              Built on Lovable by Cassie (Northwestern ’29).
            </p>
            <p>
              <Link
                to="/privacy"
                className="text-[10px] uppercase tracking-widest underline"
                style={{ color: "var(--ink-soft)" }}
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </DialogContent>
      </div>

      {demo ? (
        <DemoPreview mode={demo} onChange={setDemo} onClose={() => setDemo(null)} />
      ) : null}
    </Dialog>
  );
}
