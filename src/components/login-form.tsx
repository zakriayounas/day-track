"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordVisibilityButton from "@/components/password-visibility-button";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const client = createClient();
    if (!client) {
      setError("Connect Supabase by adding the environment variables in .env.local.");
      return;
    }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const { error: authError } = await client.auth.signInWithPassword({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setBusy(false);
    if (authError) setError(authError.message);
    else router.push("/");
  }

  async function sendResetLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const client = createClient();
    if (!client) {
      setError("Connect Supabase by adding the environment variables in .env.local.");
      return;
    }
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setBusy(true);
    try {
      const { error: resetError } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Freset-password`,
      });
      if (resetError) setError(resetError.message);
      else setNotice("If an account exists for that email, a password reset link is on its way.");
    } catch (resetError) {
      console.error("Unable to send password reset email", resetError);
      setError("We couldn't send the reset email. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={resetMode ? sendResetLink : signIn}>
        <Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link>
        <div className="eyebrow">{resetMode ? "ACCOUNT SECURITY" : "TEAM WORKSPACE"}</div>
        <h1>{resetMode ? "Reset your password" : "Welcome back"}</h1>
        <p>{resetMode ? "Enter your account email and we’ll send you a secure reset link." : "Sign in to pick up where your team left off."}</p>
        <label className="form-label" htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="email" required /></label>
        {!resetMode && <label className="form-label" htmlFor="password">Password<div className="password-field-wrap"><input id="password" name="password" type={passwordVisible ? "text" : "password"} autoComplete="current-password" required /><PasswordVisibilityButton visible={passwordVisible} onToggle={() => setPasswordVisible((visible) => !visible)} /></div></label>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-success" role="status">{notice}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? resetMode ? "Sending link..." : "Signing in..." : resetMode ? "Send reset link" : "Sign in"}</button>
        {resetMode ? <button className="auth-text-button" type="button" onClick={() => { setResetMode(false); setError(""); setNotice(""); }}>Back to sign in</button> : <><button className="auth-text-button" type="button" onClick={() => { setResetMode(true); setError(""); setNotice(""); }}>Forgot password?</button><small>Accounts are created by a workspace admin.</small></>}
      </form>
    </main>
  );
}
