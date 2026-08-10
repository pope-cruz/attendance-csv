"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

type AccessState = "checking" | "signed-out" | "signed-in";

function sharedAuthErrorMessage(message: string): string {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "That shared password was not accepted.";
  }

  return "Sign-in could not be completed. Check your connection and try again.";
}

export function AuthGate({ children }: Readonly<{ children: ReactNode }>) {
  const [accessState, setAccessState] = useState<AccessState>("checking");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const operatorEmail = process.env.NEXT_PUBLIC_SUPABASE_OPERATOR_EMAIL?.trim();
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase || !operatorEmail) {
      return;
    }

    let isActive = true;

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!isActive) return;

      if (sessionError) {
        setError("The saved sign-in could not be checked. Please sign in again.");
        setAccessState("signed-out");
        return;
      }

      setAccessState(data.session ? "signed-in" : "signed-out");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isActive) {
        setAccessState(session ? "signed-in" : "signed-out");
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [operatorEmail, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase || !operatorEmail) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: operatorEmail,
      password,
    });

    if (signInError) {
      setError(sharedAuthErrorMessage(signInError.message));
      setIsSubmitting(false);
      return;
    }

    setPassword("");
    setAccessState("signed-in");
    setIsSubmitting(false);
  }

  if (!supabase || !operatorEmail) {
    return (
      <main className="access-page">
        <section className="access-panel access-panel-status" role="alert">
          <p className="access-eyebrow">Configuration needed</p>
          <h1>Shared access is not configured.</h1>
          <p>
            Set the Supabase URL, anonymous key, and{" "}
            <code>NEXT_PUBLIC_SUPABASE_OPERATOR_EMAIL</code>, then redeploy.
          </p>
        </section>
      </main>
    );
  }

  if (accessState === "signed-in") {
    return children;
  }

  if (accessState === "checking") {
    return (
      <main className="access-page" aria-busy="true" aria-label="Checking access">
        <section className="access-panel access-panel-status">
          <p className="access-eyebrow">tech@nyu · Event Attendance</p>
          <h1>Checking access…</h1>
        </section>
      </main>
    );
  }

  return (
    <main className="access-page">
      <section className="access-panel" aria-labelledby="access-title">
        <p className="access-eyebrow">tech@nyu · Internal</p>
        <h1 id="access-title">Event Attendance</h1>
        <p className="access-intro">
          Enter the organizer password to open the shared attendance workspace.
        </p>

        <form className="access-form" onSubmit={handleSubmit}>
          <label htmlFor="shared-password">Shared password</label>
          <input
            id="shared-password"
            name="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && (
            <p className="access-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={isSubmitting || password.length === 0}>
            {isSubmitting ? "Signing in…" : "Continue"}
          </button>
        </form>

        <p className="access-note">
          The password is verified by Supabase and is not stored in this app.
        </p>
      </section>
    </main>
  );
}
