"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("DayTrack route error", error);
  }, [error]);

  return (
    <main className="system-page">
      <div className="system-card">
        <span className="brand-mark">d.</span>
        <span className="system-code error-code">SOMETHING WENT WRONG</span>
        <h1>We couldn&apos;t load this page.</h1>
        <p>Try again. If the problem continues, contact your workspace admin.</p>
        {error.digest && <small className="error-digest">Reference: {error.digest}</small>}
        <div className="system-actions">
          <button className="primary-button" onClick={() => reset()}>Try again</button>
          <Link className="secondary-button" href="/">Back to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
