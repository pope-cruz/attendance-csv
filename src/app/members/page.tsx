"use client";

import { useEffect, useState } from "react";

import { SiteNav } from "@/components/site-nav";
import { MembersLeaderboard } from "@/components/members-leaderboard";
import { groupByMember, type Member } from "@/lib/matching/history";
import { loadEventRecords } from "@/lib/persistence";
import type { SessionEventRecord } from "@/types/event";

export default function MembersPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const records: SessionEventRecord[] = await loadEventRecords();
        if (cancelled) return;
        setEventCount(records.length);
        setMembers(groupByMember(records));
      } catch {
        if (!cancelled) setError("Saved events could not be loaded. Please try again.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-[100dvh] px-4 sm:px-6">
      <div className="mx-auto max-w-[1120px]">
        <SiteNav />

        <section className="pb-6 pt-8 sm:pb-8 sm:pt-10">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-3xl">Members</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Leaderboard from your saved events. Attended = Luma check-in time or Checked In = Yes, or Engage Attended. Ranked by most attended.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {eventCount} {eventCount === 1 ? "event" : "events"} saved • shared via Supabase
          </p>
        </section>

        {error && (
          <div className="rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-text)]" role="alert">
            {error}
          </div>
        )}

        {members === null && !error && <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">Loading members…</p>}

        {members !== null && <MembersLeaderboard members={members} />}

        <footer className="mt-8 border-t border-[var(--border)] py-5 text-xs text-[var(--muted)]">
          Shared Supabase data — deleting in Upload removes it for everyone.
        </footer>
      </div>
    </main>
  );
}
