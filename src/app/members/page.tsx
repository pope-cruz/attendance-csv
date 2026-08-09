"use client";

import { Column, Grid } from "@carbon/react";
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
    <div className="min-h-[100dvh] bg-[var(--canvas)]">
      <SiteNav />

      <main id="main-content" className="pb-12">
        <section className="attendance-hero" aria-labelledby="members-title">
          <Grid fullWidth className="attendance-hero-grid">
            <Column sm={4} md={8} lg={12}>
              <p className="attendance-eyebrow">Shared member history</p>
              <h1 id="members-title" className="attendance-title">
                Members
              </h1>
              <p className="attendance-intro">
                Review attendance history derived from saved events, ranked by
                the number of events each member attended.
              </p>
              <p className="members-meta">
                {eventCount} {eventCount === 1 ? "event" : "events"} saved ·
                shared via Supabase
              </p>
            </Column>
          </Grid>
        </section>

        <Grid fullWidth className="attendance-shell-grid members-content-grid">
          <Column sm={4} md={8} lg={16}>
            <section className="members-workspace" aria-label="Member leaderboard">
              {error && (
                <div
                  className="rounded-lg border border-[var(--error-border)] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error-text)]"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {members === null && !error && (
                <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
                  Loading members…
                </p>
              )}

              {members !== null && <MembersLeaderboard members={members} />}
            </section>
          </Column>
        </Grid>

        <Grid fullWidth className="attendance-footer-grid">
          <Column sm={4} md={8} lg={16}>
            <footer className="attendance-footer">
              <span>Shared Supabase member history.</span>
              <span>Deleting in Upload removes an event for everyone.</span>
            </footer>
          </Column>
        </Grid>
      </main>
    </div>
  );
}
