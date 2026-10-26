import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import PublicRelease from "@/components/public-release";

type PublicRelease = {
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

export const metadata: Metadata = { title: "Release notes — DayTrack" };

export default function PublicReleasePage({ params }: PageProps<"/r/[token]">) {
  return <Suspense fallback={<main className="public-page"><div className="public-not-found">Loading release…</div></main>}><PublicReleaseContent params={params} /></Suspense>;
}

async function PublicReleaseContent({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const supabase = await createClient();
  const { data } = supabase
    ? await supabase.rpc("public_release_by_token", { share_token: token })
    : { data: null };
  const release = data as PublicRelease | null;

  if (!release) {
    return <main className="public-page"><div className="public-not-found"><Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link><h1>Release not found</h1><p>This release link may have been disabled or changed.</p></div></main>;
  }

  return <PublicRelease release={release} />;
}
