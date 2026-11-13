import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { collectionOptions } from "@/lib/collection-query";
import { saveProfile } from "@/lib/collection.functions";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () =>
    pageHead("Make yourself at home", "Create your Curio profile and choose your art interests."),
  loader: ({ context }) => context.queryClient.ensureQueryData(collectionOptions()),
  component: Onboarding,
});
function Onboarding() {
  const { data } = useSuspenseQuery(collectionOptions());
  const qc = useQueryClient();
  const save = useServerFn(saveProfile);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile?.display_name ?? "");
  const [username, setUsername] = useState(data.profile?.username ?? "");
  const [preferences, setPreferences] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const questions = [
    {
      key: "art",
      title: "what pulls you in?",
      options: ["Painting", "Photography", "Sculpture", "A bit of everything"],
    },
    {
      key: "frequency",
      title: "how often do we wander?",
      options: ["Every week", "Every month", "Whenever I can"],
    },
    {
      key: "habit",
      title: "what do you keep from a visit?",
      options: ["Photos", "Notes", "Ticket stubs", "Just the feeling"],
    },
  ];
  async function finish() {
    setBusy(true);
    try {
      await save({ data: { username, display_name: name, preferences, onboarded: true } });
      localStorage.setItem("curio:visitor", name);
      await qc.invalidateQueries({ queryKey: ["collection"] });
      await navigate({ to: "/library" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Try again?");
    } finally {
      setBusy(false);
    }
  }
  const q = questions[step - 1];
  return (
    <main className="account-page">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        your Curio · {step + 1}/4
      </p>
      <section key={step} className="curio-step-fwd mt-16">
        {step === 0 ? (
          <>
            <h1 className="account-title text-left">what should I call you?</h1>
            <label className="account-label">
              Display name
              <input
                className="account-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </label>
            <label className="account-label mt-6">
              Username
              <input
                className="account-input"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="your_name"
                maxLength={24}
              />
            </label>
            <p className="text-xs mt-2 text-muted-foreground">
              3–24 letters, numbers or underscores
            </p>
          </>
        ) : q ? (
          <>
            <h1 className="account-title text-left">{q.title}</h1>
            <div className="grid gap-3">
              {q.options.map((o) => (
                <Button
                  key={o}
                  variant="outline"
                  className={`h-12 justify-start ${preferences[q.key] === o ? "bg-teal text-yellow" : ""}`}
                  onClick={() => setPreferences({ ...preferences, [q.key]: o })}
                >
                  {o}
                </Button>
              ))}
            </div>
          </>
        ) : null}
        <Button
          disabled={busy || !name.trim() || !/^[a-z0-9_]{3,24}$/.test(username)}
          className="w-full mt-10 h-12 bg-teal text-yellow"
          onClick={() => (step < 3 ? setStep(step + 1) : void finish())}
        >
          {busy ? "keeping it…" : step === 3 ? "Open my Library" : "Next →"}
        </Button>
        {step > 0 && (
          <div className="flex justify-between mt-4">
            <Button variant="link" onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button variant="link" onClick={() => void finish()}>
              Skip survey
            </Button>
          </div>
        )}
        {message && (
          <p role="alert" className="mt-4 text-sm">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
