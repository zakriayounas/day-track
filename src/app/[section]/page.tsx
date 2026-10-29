import { Suspense } from "react";
import { notFound } from "next/navigation";
import DayTrack from "@/components/daytrack";

const workspaceSections: Record<string, string> = {
  dashboard: "Dashboard",
  "my-items": "My items",
  items: "All items",
  notes: "Notes",
  releases: "Releases",
  reminders: "Reminders",
  team: "Team",
  profile: "Profile",
  settings: "Settings",
};

export default function WorkspaceSectionPage({ params }: { params: Promise<{ section: string }> }) {
  return <Suspense fallback={<main className="loading-screen" role="status"><div className="loading-content"><span className="loading-spinner" aria-hidden="true" /><h1>Loading your workspace</h1></div></main>}><WorkspaceSectionContent params={params} /></Suspense>;
}

async function WorkspaceSectionContent({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!workspaceSections[section]) notFound();
  return <DayTrack />;
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const pageTitle = workspaceSections[section];
  if (!pageTitle) return { title: "Page not found — DayTrack" };
  return { title: `${pageTitle} — DayTrack` };
}
