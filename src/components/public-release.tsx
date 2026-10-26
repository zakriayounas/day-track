"use client";

import Link from "next/link";
import { useState } from "react";

type PublicReleaseData = {
  name: string;
  target_date: string | null;
  summary: string | null;
  release_notes: string | null;
  platforms: { name: string }[];
  sql_queries: { title: string; sql: string; platform: string | null; notes: string | null }[];
  pre_steps: { title: string }[];
  post_steps: { title: string }[];
  updates: { title: string; description: string | null; platform: string | null; type: string }[];
};

export default function PublicRelease({ release }: { release: PublicReleaseData }) {
  const [toast, setToast] = useState("");
  const markdown = `# ${release.name}\n\n${release.target_date ? `Target date: ${release.target_date}\n\n` : ""}${release.summary ?? ""}\n\n## Platforms\n${release.platforms.map((platform) => `- ${platform.name}`).join("\n")}\n\n## SQL queries\n${release.sql_queries.map((query) => `### ${query.title}\n${query.platform ? `Platform: ${query.platform}\n` : ""}\n\`\`\`sql\n${query.sql}\n\`\`\`\n${query.notes ?? ""}`).join("\n\n")}\n\n## Pre-deployment\n${release.pre_steps.map((step) => `- ${step.title}`).join("\n")}\n\n## Post-deployment\n${release.post_steps.map((step) => `- ${step.title}`).join("\n")}\n\n## Release notes\n${release.release_notes ?? ""}\n\n## What's new\n${release.updates.map((update) => `- **${update.type}: ${update.title}** — ${update.description ?? ""}`).join("\n")}`;
  const copy = async (text: string, success: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(success);
    } catch {
      setToast("Could not copy to clipboard");
    }
    window.setTimeout(() => setToast(""), 2600);
  };
  return (
    <main className="public-page">
      <header className="public-top"><Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link><div className="public-actions"><button onClick={() => copy(location.href, "Public link copied")}>Copy link</button><button onClick={() => window.print()}>Download PDF</button><button onClick={() => { const blob = new Blob([markdown], { type: "text/markdown" }); const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "release-notes.md"; anchor.click(); URL.revokeObjectURL(anchor.href); }}>Download Markdown</button></div></header>
      <article className="public-release">
        <div className="eyebrow">RELEASE NOTES</div>
        <h1>{release.name}</h1>
        {release.target_date && <p className="public-date">Target deployment · {release.target_date}</p>}
        {release.summary && <p className="public-summary">{release.summary}</p>}
        <section><h2>Platforms</h2><div className="public-platforms">{release.platforms.map((platform) => <span key={platform.name}>{platform.name}</span>)}</div></section>
        {release.sql_queries.length > 0 && <section><h2>SQL queries to run</h2>{release.sql_queries.map((query) => <div className="public-sql" key={query.title}><div><b>{query.title}</b>{query.platform && <small>{query.platform}</small>}<button onClick={() => copy(query.sql, "SQL copied to clipboard")}>Copy SQL</button></div><pre>{query.sql}</pre>{query.notes && <p>{query.notes}</p>}</div>)}</section>}
        {release.pre_steps.length > 0 && <section><h2>Pre-deployment steps</h2><ol>{release.pre_steps.map((step) => <li key={step.title}>{step.title}</li>)}</ol></section>}
        {release.post_steps.length > 0 && <section><h2>Post-deployment steps</h2><ol>{release.post_steps.map((step) => <li key={step.title}>{step.title}</li>)}</ol></section>}
        {release.release_notes && <section><h2>Release notes</h2><p>{release.release_notes}</p></section>}
        {release.updates.length > 0 && <section><h2>Key updates</h2>{release.updates.map((update) => <div className="public-update" key={update.title}><span>{update.type}</span><div><b>{update.title}</b><p>{update.description}</p>{update.platform && <small>{update.platform}</small>}</div></div>)}</section>}
      </article>
      <footer className="public-footer">Shared with DayTrack <span>·</span> Built for teams that ship</footer>
      {toast && <div className="toast public-toast">{toast}</div>}
    </main>
  );
}
