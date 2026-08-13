import { Column, Grid } from "@carbon/react";

import { AttendanceReviewQueue } from "@/components/attendance-review-queue";
import { SiteNav } from "@/components/site-nav";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; attendance?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="min-h-[100dvh] bg-[var(--canvas)]">
      <SiteNav />
      <main id="main-content" className="pb-12">
        <section className="attendance-hero" aria-labelledby="review-title">
          <Grid fullWidth className="attendance-hero-grid">
            <Column sm={4} md={8} lg={12}>
              <p className="attendance-eyebrow">Data quality</p>
              <h1 id="review-title" className="attendance-title">Review</h1>
              <p className="attendance-intro">
                Resolve saved import errors without changing the original CSV row or attendance signal.
              </p>
            </Column>
          </Grid>
        </section>

        <Grid fullWidth className="attendance-shell-grid review-content-grid">
          <Column sm={4} md={8} lg={16}>
            <AttendanceReviewQueue
              initialAttendedOnly={params.attendance === "attended"}
              initialEventId={params.event}
            />
          </Column>
        </Grid>
      </main>
    </div>
  );
}
