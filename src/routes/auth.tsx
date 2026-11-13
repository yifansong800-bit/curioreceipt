import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { CurioFigure } from "@/components/curio-figure";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/auth")({
  head: () =>
    pageHead(
      "Your collection starts here",
      "Sign in to keep your museum visits in a private Curio collection.",
    ),
  component: AuthPage,
});
function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signup" | "login" | "forgot">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/library" });
    });
  }, [navigate]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("Check your email for a reset link.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session)
          setMessage("Check your email to confirm your account. I’ll keep your place.");
        else await navigate({ to: "/onboarding" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await navigate({ to: "/library" });
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "I couldn’t sign you in. Try again?");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-page">
      <Link to="/" className="text-sm text-muted-foreground">
        ← Curio
      </Link>
      <CurioFigure className="mx-auto mt-10 w-24" />
      <h1 className="account-title">Keep what moved you.</h1>
      <p className="text-sm text-muted-foreground text-center">
        {mode === "forgot"
          ? "let’s get you back in."
          : "your visits, your feelings, your little collection."}
      </p>
      {mode !== "forgot" && (
        <Button
          className="apple-signin mt-8 w-full"
          onClick={async () => {
            setMessage("");
            const r = await lovable.auth.signInWithOAuth("apple", {
              redirect_uri: window.location.origin,
            });
            if (r.error) setMessage("Apple sign-in didn’t finish. Try again?");
            else if (!r.redirected) await navigate({ to: "/library" });
          }}
        >
          Continue with Apple
        </Button>
      )}
      <form onSubmit={submit} className="mt-7 space-y-5">
        <label className="account-label">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="account-input"
          />
        </label>
        {mode !== "forgot" && (
          <label className="account-label">
            Password
            <input
              type="password"
              minLength={8}
              required
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="account-input"
            />
          </label>
        )}
        <Button type="submit" disabled={busy} className="w-full h-12 bg-teal text-yellow">
          {busy
            ? "one moment…"
            : mode === "signup"
              ? "Create my collection"
              : mode === "login"
                ? "Welcome back"
                : "Send reset link"}
        </Button>
      </form>
      {message && (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          {message}
        </p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <Button
          variant="link"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setMessage("");
          }}
        >
          {mode === "signup" ? "Already have an account?" : "Create an account"}
        </Button>
        {mode === "login" && (
          <Button variant="link" onClick={() => setMode("forgot")}>
            Forgot password?
          </Button>
        )}
      </div>
      <Link
        to="/begin"
        search={{ again: undefined }}
        className="block mt-8 text-center text-xs underline text-muted-foreground"
      >
        Try the guest version
      </Link>
    </main>
  );
}
