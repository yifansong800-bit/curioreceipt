import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Info } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Footer } from "@/components/Footer";
import { CurioFigure } from "@/components/curio-figure";
import { DemoPreview } from "@/components/demo-previews";
import { SnapIcon, LogIcon, ShareIcon } from "@/components/pixel-icons";
import type { CurioMode } from "@/components/pixel-icons";
import wordmark from "@/assets/curio-wordmark-ochre.png.asset.json";
import logDemoAsset from "@/assets/log-demo-lovers.jpg.asset.json";
import demoReceiptAsset from "@/assets/demo-receipt-lovers.png.asset.json";
import snapPosterAsset from "@/assets/snap-poster.jpg.asset.json";
import snapClipAsset from "@/assets/snap-live.mp4.asset.json";
import loversAsset from "@/assets/lovers-ii.jpg.asset.json";
import shutterAsset from "@/assets/curio-button.png.asset.json";
import figureOpenAsset from "@/assets/curio-figure-open.png.asset.json";
import figureWinkAsset from "@/assets/curio-figure-wink.png.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Curio | Your Pocket Companion for Art Museum Visits" },
      {
        name: "description",
        content:
          "Snap the art that stops you in your tracks. Curio uses AI to identify the artwork, capture your personal thoughts, and print a custom receipt for your gallery visit.",
      },
      { property: "og:title", content: "Curio | Your Pocket Companion for Art Museum Visits" },
      {
        property: "og:description",
        content: "Snap the art that stops you in your tracks. Curio uses AI to identify the artwork, capture your personal thoughts, and print a custom receipt for your gallery visit.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://curioreceipt.com/" },
      { property: "og:site_name", content: "Curio" },
      // Small square icon preview (no large screenshot card).
      { property: "og:image", content: "https://curioreceipt.com/favicon.png" },
      { property: "og:image:width", content: "64" },
      { property: "og:image:height", content: "64" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:image", content: "https://curioreceipt.com/favicon.png" },
    ],
    links: [{ rel: "canonical", href: "https://curioreceipt.com/" }],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [demo, setDemo] = useState<CurioMode | null>(null);

  // Warm the demo media (and the /begin route) on idle so the first tap on an
  // icon — and the first print — render instantly instead of fetching then.
  useEffect(() => {
    const warm = () => {
      [
        logDemoAsset.url,
        demoReceiptAsset.url,
        snapPosterAsset.url,
        loversAsset.url,
        shutterAsset.url,
        figureOpenAsset.url,
        figureWinkAsset.url,
      ].forEach((url) => {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      });
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.src = snapClipAsset.url;
      v.load();
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    // Warm immediately: a user can tap an icon well before an idle callback
    // fires, and a cold image cache is what made the first demo stutter.
    warm();
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm);
      return () => w.cancelIdleCallback?.(id);
    }
    return;
  }, []);


  return (
    <Dialog>
      <div
        className="relative h-[100dvh] overflow-hidden flex flex-col items-center justify-center"
        style={{
          paddingTop: "max(2rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(2.25rem, env(safe-area-inset-left))",
          paddingRight: "max(2.25rem, env(safe-area-inset-right))",
        }}
      >
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label="About Curio"
            className="absolute z-10 inline-flex items-center justify-center rounded-full border border-ink bg-paper p-2 text-ink transition-all duration-100 hover:bg-[var(--teal)] hover:text-[var(--yellow)] active:scale-90"
            style={{
              top: "max(2rem, env(safe-area-inset-top))",
              right: "max(2.25rem, env(safe-area-inset-right))",
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Info className="h-5 w-5" />
          </button>
        </DialogTrigger>

        <img
          src={wordmark.url}
          alt="CURIO"
          className="absolute z-10 block w-[19%] max-w-[92px]"
          style={{
            top: "max(2rem, env(safe-area-inset-top))",
            left: "max(2.25rem, env(safe-area-inset-left))",
          }}
        />

        <div className="w-full max-w-md flex flex-1 flex-col justify-between pt-14 pb-14">
          <div className="mt-16 flex justify-center">
            <CurioFigure className="w-[34%] max-w-[190px]" />
          </div>

          <div
            className="mt-8 text-center space-y-4 text-[13px] sm:text-sm leading-relaxed"
            style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}
          >
            <p>Say hello to curio.</p>
            <p>
              A pocket companion for
              <br />
              your art museum visits.
            </p>
            <p>Show me what stopped you.</p>
            <p>I'll print the memory.</p>
          </div>

          <div className="mt-9 flex items-start justify-center gap-10">
            {(
              [
                { mode: "snap", label: "SNAP", Icon: SnapIcon },
                { mode: "log", label: "LOG", Icon: LogIcon },
                { mode: "share", label: "SHARE", Icon: ShareIcon },
              ] as const
            ).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDemo(mode)}
                aria-label={`See how ${label.toLowerCase()} works`}
                className="flex flex-col items-center gap-2 transition-transform duration-100 active:scale-90"
                style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              >
                <Icon size={30} color="var(--ink)" />
                <span
                  className="text-[9px] tracking-widest"
                  style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-9 flex justify-center">
            <button
              type="button"
              onClick={() => navigate({ to: "/begin", search: { again: undefined } })}
              className="w-full uppercase tracking-[0.25em] text-sm py-3.5 transition-transform duration-100 active:scale-[0.98]"
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
