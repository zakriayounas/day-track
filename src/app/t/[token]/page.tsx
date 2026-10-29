import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import PublicTask from "@/components/public-task";
import { createClient } from "@/lib/supabase/server";

type PublicTaskData = {
  reference: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  due_date: string | null;
  tags: string[];
  body: string;
  test_steps: string;
  created_at: string;
  updated_at: string;
  reminder_at: string | null;
  reminder_repeat: string | null;
  assignee: string | null;
  creator: string | null;
  release: string | null;
  platforms: string[];
  comments: { id: string; author_name: string; body: string; created_at: string }[];
};

export const metadata: Metadata = {
  title: "Shared task — DayTrack",
  robots: { index: false, follow: false },
};

export default function PublicTaskPage({ params }: PageProps<"/t/[token]">) {
  return <Suspense fallback={<main className="public-page"><div className="public-not-found">Loading task…</div></main>}><PublicTaskContent params={params} /></Suspense>;
}

async function PublicTaskContent({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const supabase = await createClient();
  if (!supabase) return <PublicTaskUnavailable />;

  const { data, error } = await supabase.rpc("public_item_by_token", { share_token: token });
  if (error) {
    console.error("Could not load public task", error);
    return <PublicTaskUnavailable />;
  }
  const task = data as PublicTaskData | null;
  if (!task) return <PublicTaskUnavailable />;

  return <PublicTask task={task} token={token} />;
}

function PublicTaskUnavailable() {
  return <main className="public-page"><div className="public-not-found"><Link className="auth-brand" href="/"><span className="brand-mark">d.</span> daytrack</Link><h1>Task not available</h1><p>This task link may have been disabled or changed.</p></div></main>;
}
