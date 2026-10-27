"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BrandEmblem } from "@/components/brand-emblem";
import { authClient } from "@/lib/auth-client";

type CompetitionPage = "dashboard" | "challenges" | "leaderboard";

export function CompetitionNavigation({
  activePage,
  userName,
  teamName,
  role,
  children,
}: {
  activePage: CompetitionPage;
  userName: string;
  teamName: string;
  role: string;
  children?: ReactNode;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.refresh();
  }

  const links: { href: string; label: string; page: CompetitionPage }[] = [
    { href: "/", label: "Dashboard", page: "dashboard" },
    { href: "/challenges", label: "Challenges", page: "challenges" },
    { href: "/leaderboard", label: "Leaderboard", page: "leaderboard" },
  ];

  return (
    <aside className="side-navigation">
      <Link className="brand" href="/">
        <BrandEmblem />
        <span>ctrl_z</span>
      </Link>
      <nav className="side-navigation-links" aria-label="Competition navigation">
        {links.map((link) => (
          <Link
            aria-current={activePage === link.page ? "page" : undefined}
            className={`side-navigation-link${
              activePage === link.page ? " active" : ""
            }`}
            href={link.href}
            key={link.page}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
      <div className="side-navigation-account">
        <span className="subtle">{userName}</span>
        <span className="side-navigation-team">{teamName}</span>
        {(role === "ADMIN" || role === "MAIN_ADMIN") && (
          <span className="badge">
            {role === "MAIN_ADMIN" ? "MAIN ADMIN" : "ADMIN"}
          </span>
        )}
        <button
          className="btn-secondary"
          onClick={() => void signOut()}
          type="button"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
