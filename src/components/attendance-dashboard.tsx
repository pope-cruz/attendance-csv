"use client";

import { Button, Column, Grid, SkeletonText } from "@carbon/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ATTENDANCE_BASELINE,
  ATTENDANCE_STRETCH_TARGET,
  ATTENDANCE_TARGET,
  buildDashboardSummary,
  type DashboardEventSummary,
  type DashboardPeriodStats,
} from "@/lib/dashboard/summary";
import { loadEventRecords } from "@/lib/persistence";
import type { SessionEventRecord } from "@/types/event";

type ReportingPeriod = "latestSemester" | "academicYear" | "allTime";

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

function growthLabel(value: number): string {
  const percentage = Math.abs(value * 100).toFixed(0);
  if (value > 0) return `+${percentage}% vs baseline`;
  if (value < 0) return `−${percentage}% vs baseline`;
  return "At baseline";
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="dashboard-kpi-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
      <p>{detail}</p>
    </div>
  );
}

function ExecutiveMetrics({ period }: { period: DashboardPeriodStats }) {
  return (
    <dl className="dashboard-kpis">
      <MetricCard
        label="Average attendance"
        value={period.averageAttendance.toFixed(1)}
        detail={growthLabel(period.attendanceGrowthRate)}
      />
      <MetricCard
        label="Unique attendees"
        value={String(period.uniqueAttendeeCount)}
        detail="Distinct people in this period"
      />
      <MetricCard
        label="Confirmed check-ins"
        value={String(period.confirmedCheckInCount)}
        detail={`Across ${period.eventCount} ${period.eventCount === 1 ? "event" : "events"}`}
      />
      <MetricCard
        label="RSVP → attendance"
        value={formatPercent(period.showRate)}
        detail={`${period.confirmedCheckInCount} of ${period.rsvpCount} eligible RSVPs`}
      />
      <MetricCard
        label="New attendees"
        value={String(period.newAttendeeCount)}
        detail="First attendance in recorded history"
      />
      <MetricCard
        label="Returning check-ins"
        value={formatPercent(period.returningCheckInRate)}
        detail="Check-ins from prior attendees"
      />
      <MetricCard
        label="90-day repeat rate"
        value={formatPercent(period.repeatAttendanceRate)}
        detail={
          period.repeatAttendanceEligibleCount > 0
            ? `${period.repeatAttendanceEligibleCount} eligible new attendees`
            : "Waiting for a matured cohort"
        }
      />
    </dl>
  );
}

function AttendanceTrend({ events }: { events: DashboardEventSummary[] }) {
  if (events.length === 0) return null;

  const scaleMaximum = Math.max(
    ATTENDANCE_STRETCH_TARGET,
    ...events.map((event) => event.attendedCount),
  );

  return (
    <section className="dashboard-analysis" aria-labelledby="trend-heading">
      <div className="dashboard-section-heading">
        <div>
          <h2 id="trend-heading">Attendance trend</h2>
          <p>Event attendance and three-event rolling average for the latest semester.</p>
        </div>
        <div className="dashboard-target-legend" aria-label="Attendance targets">
          <span>Baseline {ATTENDANCE_BASELINE}</span>
          <span>Target {ATTENDANCE_TARGET.toFixed(1)}</span>
          <span>Stretch {ATTENDANCE_STRETCH_TARGET.toFixed(1)}</span>
        </div>
      </div>

      <ol className="dashboard-trend-list">
        {events.map((event) => (
          <li key={event.id} className="dashboard-trend-row">
            <div className="dashboard-trend-label">
              <span>{event.name}</span>
              <small>{event.dateLabel}</small>
            </div>
            <div className="dashboard-trend-track" aria-hidden="true">
              <span
                className="dashboard-trend-baseline"
                style={{ left: `${(ATTENDANCE_BASELINE / scaleMaximum) * 100}%` }}
              />
              <span
                className="dashboard-trend-bar"
                style={{ width: `${(event.attendedCount / scaleMaximum) * 100}%` }}
              />
              <span
                className="dashboard-trend-average"
                style={{ left: `${((event.rollingAverage ?? 0) / scaleMaximum) * 100}%` }}
              />
            </div>
            <div className="dashboard-trend-value">
              <strong>{event.attendedCount}</strong>
              <span>avg {(event.rollingAverage ?? 0).toFixed(1)}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function EventList({ events }: { events: DashboardEventSummary[] }) {
  return (
    <div className="dashboard-event-table-wrap">
      <table className="dashboard-event-table">
        <thead>
          <tr>
            <th scope="col">Event</th>
            <th scope="col">Attendance</th>
            <th scope="col">RSVPs</th>
            <th scope="col">Show rate</th>
            <th scope="col">New</th>
            <th scope="col">Returning</th>
            <th scope="col">Vs 31</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <th scope="row">
                <span>{event.name}</span>
                <small>{event.dateLabel}</small>
              </th>
              <td>{event.attendedCount}</td>
              <td>{event.rsvpCount}</td>
              <td>{formatPercent(event.showRate)}</td>
              <td>{event.newAttendeeCount}</td>
              <td>{event.returningAttendeeCount}</td>
              <td className={event.attendedCount >= ATTENDANCE_BASELINE ? "dashboard-positive" : ""}>
                {event.attendedCount >= ATTENDANCE_BASELINE ? "+" : ""}
                {event.attendedCount - ATTENDANCE_BASELINE}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="dashboard-loading" aria-label="Loading dashboard">
      <div className="dashboard-loading-periods">
        {[0, 1, 2, 3].map((item) => (
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
  const [reportingPeriod, setReportingPeriod] =
    useState<ReportingPeriod>("latestSemester");

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

  const summary = useMemo(
    () => (records ? buildDashboardSummary(records) : null),
    [records],
  );

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

  if (!summary) return null;
  const period = summary[reportingPeriod];
  const periodOptions: { key: ReportingPeriod; label: string; disabled: boolean }[] = [
    {
      key: "latestSemester",
      label: summary.latestSemester.label,
      disabled: !summary.latestSemester.available,
    },
    {
      key: "academicYear",
      label: summary.academicYear.label,
      disabled: !summary.academicYear.available,
    },
    { key: "allTime", label: "All time", disabled: false },
  ];

  return (
    <Grid fullWidth className="attendance-shell-grid dashboard-content-grid">
      <Column sm={4} md={8} lg={16}>
        <section className="dashboard-executive" aria-labelledby="scorecard-heading">
          <div className="dashboard-section-heading">
            <div>
              <p className="dashboard-section-eyebrow">Community scorecard</p>
              <h2 id="scorecard-heading">{period.label}</h2>
              <p>Confirmed people only. Invalid or ambiguous identities are excluded.</p>
            </div>
            <div className="dashboard-period-selector" aria-label="Reporting period">
              {periodOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={option.disabled}
                  aria-pressed={reportingPeriod === option.key}
                  onClick={() => setReportingPeriod(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <ExecutiveMetrics period={period} />

          {period.excludedAttendedRowCount > 0 && (
            <div className="dashboard-quality-warning" role="status">
              {period.excludedAttendedRowCount} checked-in {period.excludedAttendedRowCount === 1 ? "row is" : "rows are"} excluded because identity could not be resolved.{" "}
              <Link className="font-semibold underline" href="/review?attendance=attended">
                Review checked-in rows
              </Link>
            </div>
          )}
        </section>

        <AttendanceTrend events={summary.latestSemesterTrend} />

        <section className="dashboard-events" aria-labelledby="events-heading">
          <div className="dashboard-section-heading dashboard-events-heading">
            <div>
              <h2 id="events-heading">Event comparison</h2>
              <p>Use sample size, show rate, and attendee mix together when judging an event.</p>
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
                    {summary.undatedEvents.length} {summary.undatedEvents.length === 1 ? "event" : "events"}
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
