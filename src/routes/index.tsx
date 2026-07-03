import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { createVisit } from "@/lib/visits.functions";
import { getSessionId } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Curio — Museum Visit Receipt Generator" },
      {
        name: "description",
        content:
          "Turn your museum visit into a thermal receipt keepsake. Log the works you saw, how long you lingered, and how they made you feel.",
      },
      { property: "og:title", content: "Curio — Museum Visit Receipts" },
      {
        property: "og:description",
        content:
          "A little printable memento of every museum trip: artworks, lingers, and feelings on receipt paper.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const createFn = useServerFn(createVisit);
  const [visitor, setVisitor] = useState("");
  const [museum, setMuseum] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const sessionId = getSessionId();
      return createFn({
        data: {
          sessionId,
          visitorName: visitor.trim(),
          museum: museum.trim(),
        },
      });
    },
    onSuccess: (visit) => {
      if (visit) navigate({ to: "/visit/$visitId", params: { visitId: visit.id } });
    },
  });

  const canSubmit = visitor.trim().length > 0 && museum.trim().length > 0 && !mut.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div
          className="text-center leading-none"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 72,
            letterSpacing: 3,
          }}
        >
          CURIO
        </div>
        <p
          className="text-center mt-4 tracking-wide"
          style={{ color: "var(--ink-soft)" }}
        >
          ******** www.curio.com ********
        </p>
        <p className="text-center mt-6 text-sm" style={{ color: "var(--ink-soft)" }}>
          A thermal receipt for your museum visit.
          <br />
          Log the works. Print the memory.
        </p>

        <form
          className="mt-10 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mut.mutate();
          }}
        >
          <Field
            label="YOUR NAME"
            value={visitor}
            onChange={setVisitor}
            placeholder="e.g. CASSIE S."
            maxLength={60}
          />
          <Field
            label="MUSEUM VISITED"
            value={museum}
            onChange={setMuseum}
            placeholder="e.g. M+ Hong Kong"
            maxLength={80}
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full uppercase tracking-widest text-sm py-3 border transition-colors disabled:opacity-40"
            style={{
              borderColor: "var(--ink)",
              backgroundColor: "var(--ink)",
              color: "var(--paper)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}
          >
            {mut.isPending ? "Opening receipt..." : "Begin visit →"}
          </button>
          {mut.isError ? (
            <p className="text-sm" style={{ color: "var(--destructive)" }}>
              Couldn't start visit. Try again.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="block">
      <div
        className="text-xs uppercase tracking-widest mb-1"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full bg-transparent border-b px-0 py-2 text-base outline-none focus:border-b-2"
        style={{
          borderColor: "var(--ink)",
          fontFamily: "var(--font-mono)",
          color: "var(--ink)",
        }}
      />
    </label>
  );
}
