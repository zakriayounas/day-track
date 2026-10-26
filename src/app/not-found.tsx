import Link from "next/link";

export default function NotFound() {
  return (
    <main className="system-page">
      <div className="system-card">
        <Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link>
        <span className="system-code">404 · NOT FOUND</span>
        <h1>This page isn&apos;t here.</h1>
        <p>The link may be outdated, or the page may have moved.</p>
        <Link className="primary-button" href="/">Back to dashboard</Link>
      </div>
    </main>
  );
}
