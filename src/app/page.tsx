import { AttendanceCsvImporter } from "@/components/attendance-csv-importer";
import { SiteNav } from "@/components/site-nav";

export default function Home() {
  return (
    <main className="min-h-[100dvh] px-4 sm:px-6">
      <div className="mx-auto max-w-[1120px]">
        <SiteNav />

        <section className="pb-6 pt-8 sm:pb-8 sm:pt-10">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--ink)] sm:text-3xl">
            Event attendance
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Upload a Luma or NYU Engage CSV. Check-in decides who attended.
          </p>
        </section>

        <AttendanceCsvImporter />

        <footer className="mt-8 flex flex-col gap-1 border-t border-[var(--border)] py-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>Events are saved to Supabase and shared across your team.</span>
          <span>Uploads are private to your workspace</span>
        </footer>
      </div>
    </main>
  );
}
