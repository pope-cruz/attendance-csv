import { AttendanceCsvImporter } from "@/components/attendance-csv-importer";

export default function Home() {
  return (
    <main className="min-h-[100dvh] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1200px]">
        <header className="flex min-h-16 items-center justify-between rounded-3xl border border-[var(--border)] bg-white px-5 shadow-[var(--shadow-card)] sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--action)] text-sm font-bold text-white">
              t@
            </span>
            <span className="text-sm font-semibold tracking-[-0.01em]">
              tech@nyu events
            </span>
          </div>
          <span className="rounded-full bg-[var(--cloud)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
            Local workspace
          </span>
        </header>

        <section className="pb-10 pt-14 sm:pb-12 sm:pt-16">
          <p className="text-sm font-semibold text-[var(--action)]">
            Event attendance
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-light leading-[1.08] tracking-[-0.04em] text-[var(--ink)] sm:text-5xl">
            Put every attendance file in context.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">
            Add the event details, then review its Luma or NYU Engage export in
            one place.
          </p>
        </section>

        <AttendanceCsvImporter />

        <footer className="mt-10 flex flex-col gap-2 px-2 pb-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>Event details and files stay in this browser session.</span>
          <span>Event context and attendance preview</span>
        </footer>
      </div>
    </main>
  );
}
