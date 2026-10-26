import { Suspense } from "react";
import ResetPasswordForm from "@/components/reset-password-form";

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-shell"><div className="auth-card">Loading secure password form…</div></main>}>
    <ResetPasswordForm />
  </Suspense>;
}
