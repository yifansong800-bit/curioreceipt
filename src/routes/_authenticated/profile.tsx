import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Settings, UserRound, Camera, LogOut, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/collection/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { collectionOptions } from "@/lib/collection-query";
import { collectionStats } from "@/lib/collection-model";
import { saveProfile, uploadAvatar, deleteAccount } from "@/lib/collection.functions";
import { supabase } from "@/integrations/supabase/client";
import { downscaleImage } from "@/lib/downscale";
import { clearAccountDrafts } from "@/lib/local-drafts";
import { pageHead } from "@/lib/page-head";
export const Route = createFileRoute("/_authenticated/profile")({
  head: () =>
    pageHead("My profile", "Your Curio profile, museum statistics, and account settings."),
  loader: ({ context }) => context.queryClient.ensureQueryData(collectionOptions()),
  component: Profile,
});
function Profile() {
  const { data } = useSuspenseQuery(collectionOptions());
  const stats = collectionStats(data.entries);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const save = useServerFn(saveProfile);
  const avatar = useServerFn(uploadAvatar);
  const deleteFn = useServerFn(deleteAccount);
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(data.profile?.display_name ?? "");
  const [username, setUsername] = useState(data.profile?.username ?? "");
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  return (
    <AppShell active="profile">
      <div className="flex justify-between items-center mt-8">
        <p className="collection-eyebrow">THE COLLECTOR</p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Account settings"
          onClick={() => setSettings(true)}
        >
          <Settings />
        </Button>
      </div>
      <div className="profile-identity">
        <div className="profile-avatar">
          {data.avatarUrl ? (
            <img src={data.avatarUrl} alt="Your profile" />
          ) : (
            <UserRound size={40} />
          )}
        </div>
        <h1 className="collection-heading mt-6">
          {data.profile?.display_name || "Hello, collector"}
          <span className="text-yellow">.</span>
        </h1>
        <p className="text-library-muted mt-2">@{data.profile?.username || "you"}</p>
        <Button
          variant="outline"
          className="mt-6 bg-transparent text-library-fg border-library-line"
          onClick={() => setEditing(true)}
        >
          Edit profile
        </Button>
      </div>
      <div className="profile-stats">
        <div>
          <strong>{stats.visits}</strong>
          <span>visits kept</span>
        </div>
        <div>
          <strong>{stats.museums.length}</strong>
          <span>museums</span>
        </div>
        <div>
          <strong>{stats.average ? stats.average.toFixed(1) : "—"}</strong>
          <span>avg. rating</span>
        </div>
      </div>
      <section className="profile-favorites">
        <p className="collection-eyebrow">YOUR LITTLE PATTERNS</p>
        <div>
          <span>Most collected</span>
          <strong>{stats.category}</strong>
        </div>
        <div>
          <span>Artist you return to</span>
          <strong>{stats.artist}</strong>
        </div>
      </section>
      <h2 className="text-2xl font-serif mt-10">Where we’ve been</h2>
      <ul className="museum-results">
        {stats.museums.map((m) => (
          <li key={m}>
            <Link to="/museum/$name" params={{ name: m }} search={{}}>
              {m}
            </Link>
          </li>
        ))}
      </ul>
      {!stats.museums.length && (
        <p className="text-library-muted text-sm mt-4">our first museum is still ahead.</p>
      )}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogTitle>A little about you.</DialogTitle>
          <label className="account-label">
            Profile photo
            <input
              type="file"
              accept="image/*"
              className="mt-3 text-xs"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const blob = await downscaleImage(f, 400, 0.8);
                  const bytes = new Uint8Array(await blob.arrayBuffer());
                  let b = "";
                  for (const byte of bytes) b += String.fromCharCode(byte);
                  await avatar({ data: { base64: btoa(b) } });
                  await qc.invalidateQueries({ queryKey: ["collection"] });
                  toast("Photo updated.");
                } catch {
                  toast("I couldn’t save that photo. Try a JPG?");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Camera className="mt-2 h-4 w-4" />
          </label>
          <form
            className="space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await save({
                  data: {
                    username,
                    display_name: name,
                    preferences: (data.profile?.preferences ?? {}) as Record<string, string>,
                    onboarded: true,
                  },
                });
                await qc.invalidateQueries({ queryKey: ["collection"] });
                setEditing(false);
                toast("Profile updated.");
              } catch (e) {
                toast(e instanceof Error ? e.message : "Try again?");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="account-label">
              Display name
              <input
                className="account-input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="account-label">
              Username
              <input
                className="account-input"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
              />
            </label>
            <Button disabled={busy} type="submit">
              Keep changes
            </Button>
            <Button asChild variant="link">
              <Link to="/onboarding">Update preferences</Link>
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <Button variant="outline" asChild>
            <Link to="/privacy">Privacy policy</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Try the guest version</Link>
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut />
            Sign out
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setSettings(false);
              setConfirm(true);
            }}
          >
            <Trash2 />
            Delete account
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>Delete your account?</DialogTitle>
          <p className="text-sm leading-relaxed">
            Your profile, receipts, photos, drafts and bookmarks will be deleted. This can’t be
            undone.
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await deleteFn();
                if (data.profile?.id) {
                  await clearAccountDrafts(data.profile.id);
                  for (const key of Object.keys(localStorage)) {
                    if (key.startsWith(`curio:pending:${data.profile.id}:`))
                      localStorage.removeItem(key);
                  }
                }
                await qc.cancelQueries();
                qc.clear();
                await supabase.auth.signOut();
                await navigate({to:'/account-deleted',replace:true});
              } catch {
                toast("I couldn’t finish deleting your account. Please retry.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "deleting…" : "Delete my account"}
          </Button>
          <Button variant="outline" onClick={() => setConfirm(false)}>
            Keep my collection
          </Button>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
