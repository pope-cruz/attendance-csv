"use client";

import { useMemo, useState } from "react";

import type { Member } from "@/lib/matching/history";

function MemberDetail({ member, onClose }: { member: Member; onClose: () => void }) {
  const attendedEvents = member.attendedCount;
  const rsvpEvents = member.allEvents.filter((e) => !e.attended && e.rsvpLabel).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${member.displayName} attendance`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-[var(--ink)]">
              {member.displayName} — {member.displayEmail}
            </h4>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {attendedEvents} attended • {rsvpEvents > 0 ? `${rsvpEvents} RSVPed • ` : ""}
              {member.eventCount} events • {member.allEvents.length} rows total
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-md border border-[var(--border-strong)] bg-white text-sm hover:bg-[var(--subtle)]"
          >
            ✕
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[var(--muted)]">
          Attended = checked in (Luma time or Yes) or Engage Attended. RSVPed = Luma approved/registered but not checked in.
        </p>
        <ul className="mt-4 divide-y divide-[var(--border)] text-xs">
          {member.allEvents
            .slice()
            .sort((a, b) => {
              const attendOrder = (b.attended ? 1 : 0) - (a.attended ? 1 : 0);
              if (attendOrder !== 0) return attendOrder;
              return a.eventName.localeCompare(b.eventName);
            })
            .map((ev) => {
              const isRsvped = !ev.attended && Boolean(ev.rsvpLabel);
              const statusLabel = ev.attended ? "Attended" : isRsvped ? "RSVPed" : "Not attended";
              const detail = ev.attended
                ? ev.rawAttendanceValue
                  ? `Checked in — ${ev.rawAttendanceValue}`
                  : "Checked in"
                : isRsvped
                  ? `Not checked in but ${ev.rsvpLabel}`
                  : "Not checked in";
              return (
                <li key={`${ev.eventId}-${ev.rowNumber}`} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--ink)]">{ev.eventName}</span>
                    <span className="block text-[11px] leading-4 text-[var(--muted)]">
                      {ev.eventDate} • {ev.source === "luma" ? "Luma" : "Engage"} • row {ev.rowNumber}
                    </span>
                    <span className="block text-[11px] font-medium leading-4 text-[var(--slate)]">{detail}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                      ev.attended
                        ? "bg-[var(--success-bg)] text-[var(--success-text)]"
                        : isRsvped
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-[var(--subtle)] text-[var(--muted)]"
                    }`}
                  >
                    {statusLabel}
                  </span>
                </li>
              );
            })}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md bg-[var(--action)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--action-hover)]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function MembersLeaderboard({ members }: { members: Member[] }) {
  const [query, setQuery] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.displayName.toLowerCase().includes(q) || m.displayEmail.toLowerCase().includes(q) || m.normalizedEmail.includes(q),
    );
  }, [members, query]);

  const selected = selectedEmail ? members.find((m) => m.normalizedEmail === selectedEmail) ?? null : null;

  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="text-sm font-semibold">No members yet</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Upload events on the <a href="/" className="underline">Upload</a> tab. Attended members will be saved to Supabase and appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted)]">
          {members.length} {members.length === 1 ? "member" : "members"} • sorted by most attended
        </p>
        <input
          type="search"
          placeholder="Search name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 w-full rounded-lg border border-[var(--border-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--action)] focus:ring-4 focus:ring-[var(--action-ring)] sm:w-64"
          aria-label="Search members"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-[var(--subtle)] text-xs text-[var(--muted)]">
            <tr>
              <th className="w-12 px-4 py-3 font-semibold">#</th>
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Attended</th>
              <th className="px-4 py-3 font-semibold">Events</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {filtered.map((m, idx) => {
              const rank = idx + 1;
              const isSelected = selectedEmail === m.normalizedEmail;
              return (
                <tr
                  key={m.normalizedEmail}
                  className={`cursor-pointer hover:bg-[var(--subtle)] ${isSelected ? "bg-[var(--action-soft)]" : ""}`}
                  onClick={() => setSelectedEmail(isSelected ? null : m.normalizedEmail)}
                >
                  <td className="px-4 py-3 text-xs font-semibold text-[var(--muted)]">{rank}</td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-[var(--ink)]">{m.displayName}</span>
                    <span className="block text-xs text-[var(--muted)]">{m.displayEmail}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-[var(--success-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--success-text)]">
                      {m.attendedCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">{m.eventCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-4 py-3 text-sm text-[var(--muted)]">No matches for “{query}”.</p>
      )}

      {selected && <MemberDetail member={selected} onClose={() => setSelectedEmail(null)} />}
    </div>
  );
}
