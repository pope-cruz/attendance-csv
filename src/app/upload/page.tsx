"use client";

import { Column, Grid } from "@carbon/react";

import { AttendanceCsvImporter } from "@/components/attendance-csv-importer";
import { SiteNav } from "@/components/site-nav";

export default function UploadPage() {
  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)]">
      <SiteNav />

      <main id="main-content" className="pb-12">
        <section className="attendance-hero" aria-labelledby="page-title">
          <Grid fullWidth className="attendance-hero-grid">
            <Column sm={4} md={8} lg={12}>
              <p className="attendance-eyebrow">Internal event operations</p>
              <h1 id="page-title" className="attendance-title">
                Tech@NYU event attendance
              </h1>
              <p className="attendance-intro">
                Import a Luma or NYU Engage export, verify every source row, and
                save confirmed attendance to the shared workspace.
              </p>
            </Column>
          </Grid>
        </section>

        <AttendanceCsvImporter />

        <Grid fullWidth className="attendance-footer-grid">
          <Column sm={4} md={8} lg={16}>
            <footer className="attendance-footer">
              <span>Saved to Supabase and shared across the operator team.</span>
              <span>CSV parsing happens in this browser before save.</span>
            </footer>
          </Column>
        </Grid>
      </main>
    </div>
  );
}
