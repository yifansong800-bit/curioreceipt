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
      { title: "Let's begin — Curio" },
      {
        name: "description",
        content: "Tell me your name and which museum we're in, and I'll get the printer warm.",
      },
      { property: "og:title", content: "Let's begin — Curio" },
      {
        property: "og:description",
        content: "Two questions from me, one photo from you, one thermal receipt for the piece you couldn't walk past.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),

  component: BeginPage,
});

type Step = "name" | "where" | "museum";

const STEPS: Step[] = ["name", "where", "museum"];

function BeginPage() {
  const navigate = useNavigate();
  const createFn = useServerFn(createVisit);
  const suggestFn = useServerFn(suggestMuseums);

  const [step, setStep] = useState<Step>("name");
  const [dir, setDir] = useState<"fwd" | "back">("fwd");
  const [visitor, setVisitor] = useState("");
  const [stillHere, setStillHere] = useState<boolean | null>(null);
  const [museum, setMuseum] = useState("");
  const [picked, setPicked] = useState<Suggestion | null>(null);

  function go(next: Step, direction: "fwd" | "back" = "fwd") {
    setDir(direction);
    setStep(next);
  }

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
    if (step === "museum") go("where", "back");
    else if (step === "where") go("name", "back");
    else navigate({ to: "/" });
  }

  const stepIndex = STEPS.indexOf(step);
  const anim = dir === "fwd" ? "curio-step-fwd" : "curio-step-back";


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
        onPointerDown={back}
        aria-label="Back"
        className="absolute z-20 -m-2 p-4 transition-transform duration-100 active:scale-90"
        style={{
          top: "max(1rem, env(safe-area-inset-top))",
          left: "max(1rem, env(safe-area-inset-left))",
          color: "var(--ink)",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div
        className="pointer-events-none absolute left-0 right-0 z-0 flex justify-center"
        style={{ top: "max(1.1rem, env(safe-area-inset-top))" }}
      >
        <ModeMark mode="snap" size={22} />
      </div>

      <div className="w-full max-w-md">

        <div className="mb-6">
          <div
            className="text-xs uppercase tracking-[0.25em] mb-2 text-center"
            style={{ color: "var(--ink-soft)" }}
          >
            {`0${stepIndex + 1} / 03`}
          </div>
          <div
            className="mx-auto h-[2px] w-full max-w-[220px] overflow-hidden"
            style={{ backgroundColor: "color-mix(in srgb, var(--ink) 15%, transparent)" }}
          >
            <div
              className="h-full"
              style={{
                width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
                backgroundColor: "var(--teal)",
                transition: "width 400ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>
        </div>

        <div key={step} className={anim}>
          {step === "name" ? (
            <div className="curio-stagger space-y-8">
              <h1 className="text-xl sm:text-2xl" style={{ fontFamily: "var(--font-mono)" }}>
                hi. what should I call you?
              </h1>
              <Field
                label="YOUR NAME"
                value={visitor}
                onChange={setVisitor}
                placeholder="Michael Scott"
                maxLength={60}
                autoFocus
                onEnter={() => {
                  if (visitor.trim()) go("where");
                }}
              />
              <PrimaryButton
                disabled={!visitor.trim()}
                onClick={() => go("where")}
                label="next →"
              />
            </div>
          ) : null}

          {step === "where" ? (
            <div className="curio-stagger space-y-8">
              <h1 className="text-xl sm:text-2xl" style={{ fontFamily: "var(--font-mono)" }}>
                are we still in the museum together?
              </h1>
              <div className="grid gap-3">
                <ChoiceButton
                  label="yes — I'm standing in front of it"
                  selected={stillHere === true}
                  onClick={() => {
                    setStillHere(true);
                    go("museum");
                  }}
                />
                <ChoiceButton
                  label="no — I've already left"
                  selected={stillHere === false}
                  onClick={() => {
                    setStillHere(false);
                    go("museum");
                  }}
                />
              </div>
            </div>
          ) : null}

          {step === "museum" ? (
            <div className="curio-stagger space-y-8">
              <h1 className="text-xl sm:text-2xl" style={{ fontFamily: "var(--font-mono)" }}>
                {stillHere ? "which museum are we in?" : "where were we?"}
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
                label={opening ? "warming up the printer…" : "let's go →"}
                busy={opening}
              />
              {mut.isError ? (
                <p className="text-sm" style={{ color: "var(--destructive)" }}>
                  that didn't take — try me again?
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>


      <Footer className="absolute bottom-0" />
    </div>
  );
}

function PrimaryButton({
  label,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full uppercase tracking-widest text-sm py-3 transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
      style={{
        backgroundColor: "var(--teal)",
        color: "var(--yellow)",
        fontFamily: "var(--font-mono)",
        fontWeight: 500,
        opacity: busy ? 0.85 : undefined,
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        key={label}
        className="curio-card-in inline-block"
        style={{ animationDuration: "200ms" }}
      >
        {label}
      </span>
    </button>
  );
}

function ChoiceButton({
  label,
  onClick,
  selected,
}: {
  label: string;
  onClick: () => void;
  selected?: boolean;
}) {
  const [on, setOn] = useState(false);
  const active = on || selected;
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => setOn(true)}
      onPointerLeave={() => setOn(false)}
      onPointerDown={() => setOn(true)}
      className="w-full border px-4 py-4 text-left transition-all duration-200 active:scale-[0.99]"
      style={{
        borderColor: active ? "var(--teal)" : "var(--ink)",
        backgroundColor: active ? "var(--teal)" : "transparent",
        color: active ? "var(--yellow)" : "var(--ink)",
        fontFamily: "var(--font-mono)",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div className="text-sm">{label}</div>
    </button>
  );
}

