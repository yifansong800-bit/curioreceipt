import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/reset-password")({
  head: () =>
    pageHead("Reset your password", "Choose a new password for your private Curio collection."),
  component: Reset,
});
function Reset() {
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setRecovery(
      new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery" ||
        new URLSearchParams(window.location.search).get("type") === "recovery",
    );
  }, []);
  return (
    <main className="account-page">
      <h1 className="account-title">A fresh start.</h1>
      {recovery ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const { error } = await supabase.auth.updateUser({ password });
            if (error) setMessage(error.message);
            else {
              setMessage("Password updated.");
              await navigate({ to: "/library" });
            }
          }}
        >
          <label className="account-label">
            New password
            <input
              type="password"
              minLength={8}
              required
              className="account-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button className="mt-6 w-full" type="submit">
            Update password
          </Button>
        </form>
      ) : (
        <p>This reset link is missing or has expired. Request a new one.</p>
      )}
      <p role="status" className="mt-4">
        {message}
      </p>
      <Link to="/auth" className="block mt-8 underline">
        Back to sign in
      </Link>
    </main>
  );
}
