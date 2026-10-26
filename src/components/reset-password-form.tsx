"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInvite = searchParams.get("mode") === "invite";
  const linkError = searchParams.get("error");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const checkSession = async () => {
      const client = createClient();
      if (!client) {
        setError("Supabase is not configured. Add the project URL and anon key to .env.local.");
        setCheckingSession(false);
        return;
      }
      const { data, error: sessionError } = await client.auth.getUser();
      if (!active) return;
      if (sessionError) setError("This password link is invalid or has expired. Request a new one and try again.");
      setHasSession(Boolean(data.user));
      setCheckingSession(false);
    };
    void checkSession().catch((sessionError: unknown) => {
      console.error("Unable to validate password link", sessionError);
      if (active) {
        setError("We couldn't verify this password link. Request a new one and try again.");
        setCheckingSession(false);
      }
    });
    return () => { active = false; };
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    const client = createClient();
    if (!client) {
      setError("Supabase is not configured. Add the project URL and anon key to .env.local.");
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess("Your password is set. Taking you to your workspace…");
      window.setTimeout(() => router.replace("/"), 1200);
    } catch (updateError) {
      console.error("Unable to update account password", updateError);
      setError("We couldn't update your password. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={updatePassword}>
        <Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link>
        <div className="eyebrow">{isInvite ? "WELCOME TO THE TEAM" : "ACCOUNT SECURITY"}</div>
        <h1>{isInvite ? "Set your password" : "Reset your password"}</h1>
        <p>{isInvite ? "Choose a password to finish joining your DayTrack workspace." : "Choose a new password for your DayTrack account."}</p>
        {checkingSession ? <div className="auth-info" role="status">Verifying your secure link…</div> : hasSession ? <>
          <label className="form-label" htmlFor="new-password">New password<input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="form-label" htmlFor="confirm-password">Confirm new password<input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          <small className="password-hint">Use at least 8 characters.</small>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {success && <div className="auth-success" role="status">{success}</div>}
          <button className="primary-button auth-submit" disabled={busy || Boolean(success)}>{busy ? "Saving password..." : "Set password"}</button>
        </> : <>
          <div className="auth-error" role="alert">{error || (linkError ? "This password link is invalid or has expired. Request a new one and try again." : "This password link is invalid or has expired.")}</div>
          <Link className="secondary-button auth-back-link" href="/login">Back to sign in</Link>
        </>}
      </form>
    </main>
  );
}
