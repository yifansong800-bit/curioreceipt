import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { createVisit, suggestMuseums } from "@/lib/visits.functions";
import { getSessionId } from "@/lib/session";
import { Field, MuseumAutocomplete, type Suggestion } from "@/components/museum-autocomplete";
import { ModeMark } from "@/components/pixel-icons";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/begin")({
  head: () => ({
    meta: [
      { title: "Begin your visit — Curio" },
      {
        name: "description",
        content: "Tell Curio who you are and which museum you're in, then snap or upload your favorite piece.",
      },
      { property: "og:title", content: "Begin your visit — Curio" },
      {
        property: "og:description",
        content: "Three quick questions, then print your favorite art piece as a thermal receipt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BeginPage,
});

type Step = "name" | "where" | "museum";

function BeginPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createVisit);
  const suggestFn = useServerFn(suggestMuseums);

  const [step, setStep] = useState<Step>("name");
  const [visitor, setVisitor] = useState("");
  const [stillHere, setStillHere] = useState<boolean | null>(null);
  const [museum, setMuseum] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("curio:visitor");
      if (stored && stored.trim()) setVisitor(stored);
    } catch {}
  }, []);

  const mut = useMutation({
    mutationFn: async () => {
      const sessionId = getSessionId();
      const name = visitor.trim();
      try {
        localStorage.setItem("curio:visitor", name);
      } catch {}
      return createFn({
        data: {
          sessionId,
          visitorName: name,
          museum: museum.trim(),
          city: picked?.city ?? null,
          country: picked?.country ?? null,
        },
      });
    },
    onSuccess: (visit) => {
      if (visit)
        navigate({
          to: "/visit/$visitId",
          params: { visitId: visit.id },
          search: { mode: stillHere ? "snap" : "upload" },
        });
    },
  });

  const opening = mut.isPending || mut.isSuccess;

  function back() {
    if (step === "museum") setStep("where");
    else if (step === "where") setStep("name");
    else navigate({ to: "/" });
  }

  return (
    <div
      className="relative min-h-[100dvh] flex flex-col items-center justify-center px-[max(1.75rem,env(safe-area-inset-left))]"
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(4rem, env(safe-area-inset-bottom))",
      }}
    >
      <button
        type="button"
        onClick={back}
        aria-label="Back"
        className="absolute p-2"
        style={{
          top: "max(1rem, env(safe-area-inset-top))",
          left: "max(1rem, env(safe-area-inset-left))",
          color: "var(--ink)",
          touchAction: "manipulation",
        }}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <ModeMark
        mode={step === "where" ? "snap" : "log"}
        size={22}
        className="absolute"
        // centred at the top of the page
      />

      <div className="w-full max-w-md">
        <div
          className="text-xs uppercase tracking-[0.25em] mb-6 text-center"
          style={{ color: "var(--ink-soft)" }}
        >
          {step === "name" ? "01 / 03" : step === "where" ? "02 / 03" : "03 / 03"}
        </div>

        {step === "name" ? (
          <div className="space-y-8">
            <h1 className="text-xl sm:text-2xl" style={{ fontFamily: "var(--font-mono)" }}>
              First — what should we call you?
            </h1>
            <Field
              label="YOUR NAME"
              value={visitor}
              onChange={setVisitor}
              placeholder="Michael Scott"
              maxLength={60}
              autoFocus
            />
            <PrimaryButton
              disabled={!visitor.trim()}
              onClick={() => setStep("where")}
              label="next →"
            />
          </div>
        ) : null}

        {step === "where" ? (
          <div className="space-y-8">
            <h1 className="text-xl sm:text-2xl" style={{ fontFamily: "var(--font-mono)" }}>
              Are you still at the museum?
            </h1>
            <div className="grid gap-3">
              <ChoiceButton
                label="Yes — I'm standing in front of it"
                hint="You'll snap the piece with your camera."
                onClick={() => {
                  setStillHere(true);
                  setStep("museum");
                }}
              />
              <ChoiceButton
                label="No — I've already left"
                hint="You'll upload a photo from your camera roll."
                onClick={() => {
                  setStillHere(false);
                  setStep("museum");
                }}
              />
            </div>
          </div>
        ) : null}

        {step === "museum" ? (
          <div className="space-y-8">
            <h1 className="text-xl sm:text-2xl" style={{ fontFamily: "var(--font-mono)" }}>
              Which museum {stillHere ? "are you in" : "was it"}?
            </h1>
            <MuseumAutocomplete
              value={museum}
              onChange={(v) => {
                setMuseum(v);
                setPicked(null);
              }}
              onPick={(s) => {
                setMuseum(s.name);
                setPicked(s);
              }}
              picked={picked}
              suggest={suggestFn}
            />
            <PrimaryButton
              disabled={!museum.trim() || opening}
              onClick={() => mut.mutate()}
              label={opening ? "opening receipt…" : "begin visit →"}
            />
            {mut.isError ? (
              <p className="text-sm" style={{ color: "var(--destructive)" }}>
                Couldn't start visit. Try again.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <Footer className="absolute bottom-0" />
    </div>
  );
}

function PrimaryButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full uppercase tracking-widest text-sm py-3 border transition-colors disabled:opacity-40"
      style={{
        borderColor: "var(--ink)",
        backgroundColor: "var(--ink)",
        color: "var(--paper)",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        touchAction: "manipulation",
      }}
    >
      {label}
    </button>
  );
}

function ChoiceButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border px-4 py-4 text-left transition-colors hover:bg-ink hover:text-paper"
      style={{
        borderColor: "var(--ink)",
        fontFamily: "var(--font-mono)",
        touchAction: "manipulation",
      }}
    >
      <div className="text-sm">{label}</div>
      <div className="text-[11px] mt-1 opacity-70">{hint}</div>
    </button>
  );
}
