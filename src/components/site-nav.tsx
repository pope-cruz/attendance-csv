"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Upload" },
  { href: "/members", label: "Members" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="flex min-h-16 items-center justify-between border-b border-[var(--border)]">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="grid size-8 place-items-center rounded-md bg-[var(--action)] text-xs font-bold text-white no-underline"
        >
          t@
        </Link>
        <span className="text-sm font-semibold">tech@nyu events</span>
        <nav aria-label="Primary" className="ml-6 flex gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--action)] text-white"
                    : "text-[var(--muted)] hover:bg-[var(--subtle)] hover:text-[var(--ink)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <span className="hidden text-xs font-medium text-[var(--muted)] sm:block">
        Shared workspace
      </span>
    </header>
  );
}
