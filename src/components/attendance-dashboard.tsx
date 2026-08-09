"use client";

import { Button, Column, Grid, SkeletonText } from "@carbon/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  buildDashboardSummary,
  type DashboardEventSummary,
  type DashboardPeriodStats,
} from "@/lib/dashboard/summary";
import { loadEventRecords } from "@/lib/persistence";
import type { SessionEventRecord } from "@/types/event";

function PeriodStats({ period }: { period: DashboardPeriodStats }) {
  return (
    <section className="dashboard-period" aria-label={`${period.label} attendance`}>
      <div className="dashboard-period-heading">
        <h2>{period.label}</h2>
        <span>
          {period.available
            ? `${period.eventCount} ${period.eventCount === 1 ? "event" : "events"}`
            : "No dated events"}
        </span>
      </div>
      <dl className="dashboard-metrics">
        <div>
          <dt>Unique attendees</dt>
          <dd>{period.available ? period.uniqueAttendeeCount : "\u2014"}</dd>
        </div>
        <div>
          <dt>Average per event</dt>
          <dd>{period.available ? period.averageAttendance.toFixed(1) : "\u2014"}</dd>
        </div>
      </dl>
    </section>
  );
}

function EventList({ events }: { events: DashboardEventSummary[] }) {
  return (
    <ul className="dashboard-event-list">
      {events.map((event) => (
        <li key={event.id} className="dashboard-event-row">
          <div className="dashboard-event-copy">
            <span className="dashboard-event-name">{event.name}</span>
            <span className="dashboard-event-date">{event.dateLabel}</span>
          </div>
          <span className="dashboard-event-attendance">
            {event.attendedCount} attended
          </span>
        </li>
      ))}
    </ul>
  );
}

function DashboardLoading() {
  return (
    <div className="dashboard-loading" aria-label="Loading dashboard">
      <div className="dashboard-loading-periods">
        {[0, 1, 2].map((item) => (
          <div key={item} className="dashboard-loading-period">
            <SkeletonText heading width="40%" />
            <SkeletonText width="65%" />
            <SkeletonText width="52%" />
          </div>
        ))}
      </div>
      <SkeletonText heading width="18%" />
      <SkeletonText paragraph lineCount={4} />
    </div>
  );
}

export function AttendanceDashboard() {
  const [records, setRecords] = useState<SessionEventRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const retry = useCallback(() => {
    setRecords(null);
    setError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const savedRecords = await loadEventRecords();
        if (!cancelled) setRecords(savedRecords);
      } catch {
        if (!cancelled) {
          setError("Dashboard data could not be loaded. Please try again.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  if (error) {
    return (
      <Grid fullWidth className="attendance-shell-grid dashboard-content-grid">
        <Column sm={4} md={8} lg={16}>
          <section className="dashboard-state" role="alert">
            <h2>Dashboard unavailable</h2>
            <p>{error}</p>
            <Button kind="primary" size="md" onClick={retry}>
              Try again
            </Button>
          </section>
        </Column>
      </Grid>
    );
  }

  if (records === null) {
    return (
      <Grid fullWidth className="attendance-shell-grid dashboard-content-grid">
        <Column sm={4} md={8} lg={16}>
          <DashboardLoading />
        </Column>
      </Grid>
    );
  }

  if (records.length === 0) {
    return (
      <Grid fullWidth className="attendance-shell-grid dashboard-content-grid">
        <Column sm={4} md={8} lg={16}>
          <section className="dashboard-state">
            <h2>No attendance history yet</h2>
            <p>
              Add the first event from a Luma or NYU Engage attendance export.
            </p>
            <Button as={Link} href="/upload" kind="primary" size="md">
              Upload an event
            </Button>
          </section>
        </Column>
      </Grid>
    );
  }

  const summary = buildDashboardSummary(records);
  const periods = [
    summary.latestSemester,
    summary.academicYear,
    summary.allTime,
  ];

  return (
    <Grid fullWidth className="attendance-shell-grid dashboard-content-grid">
      <Column sm={4} md={8} lg={16}>
        <div className="dashboard-periods">
          {periods.map((period) => (
            <PeriodStats key={period.label} period={period} />
          ))}
        </div>

        <section className="dashboard-events" aria-labelledby="events-heading">
          <div className="dashboard-events-heading">
            <div>
              <h2 id="events-heading">Events</h2>
              <p>Confirmed attendance only. RSVPs are excluded.</p>
            </div>
            <span>
              {records.length} {records.length === 1 ? "event" : "events"}
            </span>
          </div>

          <div className="dashboard-semesters">
            {summary.semesterGroups.map((group) => (
              <section key={group.key} className="dashboard-semester">
                <div className="dashboard-semester-heading">
                  <h3>{group.label}</h3>
                  <span>
                    {group.events.length} {group.events.length === 1 ? "event" : "events"}
                  </span>
                </div>
                <EventList events={group.events} />
              </section>
            ))}

            {summary.undatedEvents.length > 0 && (
              <section className="dashboard-semester">
                <div className="dashboard-semester-heading">
                  <h3>Date needed</h3>
                  <span>
                    {summary.undatedEvents.length}{" "}
                    {summary.undatedEvents.length === 1 ? "event" : "events"}
                  </span>
                </div>
                <EventList events={summary.undatedEvents} />
              </section>
            )}
          </div>
        </section>
      </Column>
    </Grid>
  );
}
