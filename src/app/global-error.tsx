"use client";

import "./globals.css";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="system-page">
          <div className="system-card">
            <span className="brand-mark">d.</span>
            <span className="system-code error-code">APPLICATION ERROR</span>
            <h1>DayTrack needs a refresh.</h1>
            <p>An unexpected error interrupted the app. Try loading it again.</p>
            <button className="primary-button" onClick={() => reset()}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
