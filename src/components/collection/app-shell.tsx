import { Link } from "@tanstack/react-router";
import { Library, Plus, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import wordmark from "@/assets/curio-wordmark-thin.png.asset.json";
export function AppShell({
  children,
  active = "library",
}: {
  children: ReactNode;
  active?: "library" | "profile";
}) {
  return (
    <div className="collection-app">
      <div className="collection-shell">
        <header className="collection-top">
          <Link to="/library" aria-label="Curio Library">
            <img src={wordmark.url} alt="Curio" className="collection-wordmark" />
          </Link>
          <span className="text-[10px] uppercase tracking-widest text-library-muted">
            a little archive of you
          </span>
        </header>
        <main className="pb-28">{children}</main>
        <nav className="collection-nav" aria-label="Main navigation">
          <Button
            asChild
            variant="ghost"
            className={active === "library" ? "text-library-fg" : "text-library-muted"}
          >
            <Link to="/library">
              <Library />
              Library
            </Link>
          </Button>
          <Button asChild className="collection-add" aria-label="Log a visit">
            <Link to="/begin" search={{ again: true }}>
              <Plus />
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className={active === "profile" ? "text-library-fg" : "text-library-muted"}
          >
            <Link to="/profile">
              <UserRound />
              Profile
            </Link>
          </Button>
        </nav>
      </div>
    </div>
  );
}
