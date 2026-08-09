"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import techAtNyuLogo from "../../black_bg_logo.png";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/upload", label: "Upload" },
  { href: "/members", label: "Members" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <div className="site-brand">
        <Link
          href="/"
          className="site-mark"
          aria-label="tech at NYU attendance home"
        >
          <Image
            alt="tech@nyu"
            className="site-logo"
            fill
            priority
            src={techAtNyuLogo.src}
            sizes="120px"
          />
        </Link>
        <span className="site-divider" aria-hidden="true" />
        <span className="site-section">Event Attendance</span>
      </div>
      <div className="site-actions">
        <nav aria-label="Primary" className="site-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`site-nav-link ${isActive ? "site-nav-link-active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <span className="site-environment">Internal</span>
      </div>
    </header>
  );
}
