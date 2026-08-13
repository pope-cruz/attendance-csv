"use client";

import { Column, Grid } from "@carbon/react";

import { AttendanceDashboard } from "@/components/attendance-dashboard";
import { SiteNav } from "@/components/site-nav";

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)]">
      <SiteNav />

      <main id="main-content" className="pb-12">
        <section className="attendance-hero" aria-labelledby="dashboard-title">
          <Grid fullWidth className="attendance-hero-grid">
            <Column sm={4} md={8} lg={12}>
              <p className="attendance-eyebrow">GTM experimentation system</p>
              <h1 id="dashboard-title" className="attendance-title">
                Dashboard
              </h1>
              <p className="attendance-intro">
                Track whether attendance is growing, how reliably RSVPs convert,
                and whether first-time attendees return.
              </p>
            </Column>
          </Grid>
        </section>

        <AttendanceDashboard />

        <Grid fullWidth className="attendance-footer-grid">
          <Column sm={4} md={8} lg={16}>
            <footer className="attendance-footer">
              <span>Shared Supabase attendance history.</span>
              <span>KPIs use distinct, resolved attendee identities.</span>
            </footer>
          </Column>
        </Grid>
      </main>
    </div>
  );
}
