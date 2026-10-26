"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ItemType = "task" | "issue" | "note" | "meeting_note" | "testing_note" | "release_note";
type Status = "todo" | "in_progress" | "blocked" | "done";
type Priority = "low" | "medium" | "high" | "urgent";
type Item = {
  id: string;
  dbId: string;
  assigneeId: string | null;
  creatorId: string;
  dueDate: string | null;
  title: string;
  type: ItemType;
  status: Status;
  priority: Priority;
  assignee: string;
  due: string;
  tags: string[];
  body: string;
  reminder?: string;
  reminderRepeat?: "none" | "daily" | "weekly";
};
type Profile = { id: string; display_name: string; role: "admin" | "user"; email?: string };
type AppRelease = { id: string; name: string; target_date: string | null; status: string; summary: string | null; release_notes: string | null };
type ItemComment = { id: string; item_id: string; author_id: string; body: string; created_at: string; authorName: string };

const typeNames: Record<ItemType, string> = { task: "Task", issue: "Issue", note: "Note", meeting_note: "Meeting note", testing_note: "Testing note", release_note: "Release note" };
const statusNames: Record<Status, string> = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" };
const navItems = ["Dashboard", "My Items", "All Items", "Notes", "Releases", "Reminders", "Team", "Settings"];

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    inbox: <><path d="M4 4h16l1 11h-5l-2 3h-4l-2-3H3z" /><path d="M3 15h5l2 3h4l2-3h5" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    rocket: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2 2 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 3c0 2.72-.78 7.5-5 11a22.35 22.35 0 0 1-5 1z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.7-1.4-2.4L7.6 15a8 8 0 0 1 0-1.9L6.2 12l1.4-2.4 1.7.7a8 8 0 0 1 1.6-.9l.3-1.8H14l.3 1.8a8 8 0 0 1 1.6.9l1.7-.7L19 12l-1.4 1.1a8 8 0 0 1-.2 1.9z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v7m6-7v7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /></>,
    command: <><path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.list}</svg>;
}

function Label({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`label label-${tone}`}>{children}</span>;
}

function formatDueDate(value: string | null, today = ""): string {
  if (!value) return "No date";
  if (value === today) return "Today";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function localDateValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mapDatabaseItem(row: Record<string, unknown>, profiles: Profile[]): Item {
  const assigneeId = typeof row.assignee_id === "string" ? row.assignee_id : null;
  const creatorId = String(row.created_by);
  const profile = profiles.find((candidate) => candidate.id === assigneeId);
  return {
    id: String(row.reference),
    dbId: String(row.id),
    assigneeId,
    creatorId,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    title: String(row.title),
    type: row.type as ItemType,
    status: row.status as Status,
    priority: row.priority as Priority,
    assignee: profile?.display_name || "Unassigned",
    due: formatDueDate(typeof row.due_date === "string" ? row.due_date : null),
    tags: Array.isArray(row.tags) ? row.tags as string[] : [],
    body: String(row.body ?? ""),
    ...(typeof row.reminder_at === "string" && !row.reminder_dismissed_at ? { reminder: row.reminder_at } : {}),
    reminderRepeat: row.reminder_repeat as Item["reminderRepeat"],
  };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function DayTrack() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [activeRelease, setActiveRelease] = useState<AppRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [demoLoaded, setDemoLoaded] = useState<boolean | null>(null);
  const [demoPromptOpen, setDemoPromptOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const [inviting, setInviting] = useState(false);
  const [today, setToday] = useState("");
  const [todayLabel, setTodayLabel] = useState("");
  const [headerDate, setHeaderDate] = useState("");
  const [view, setView] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All types");
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const commentsRequestRef = useRef(0);
  const [notificationState, setNotificationState] = useState<"ask" | "enabled" | "denied" | "unsupported">("ask");
  const [title, setTitle] = useState("");
  const [newType, setNewType] = useState<ItemType>("task");
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [newReminder, setNewReminder] = useState("");
  const [newReminderRepeat, setNewReminderRepeat] = useState<"none" | "daily" | "weekly">("none");

  useEffect(() => {
    let mounted = true;
    const client = createClient();
    const initialize = async () => {
      if (!client) {
        setLoadError("Supabase is not configured. Add the project URL and anon key to .env.local, then restart the app.");
        setLoading(false);
        return;
      }
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user) {
        router.replace("/login");
        return;
      }
      const { data: profileData, error: profileError } = await client.from("profiles").select("id,email,display_name,role,is_active").order("display_name");
      if (profileError) {
        setLoadError(profileError.message.includes("profiles.email")
          ? "Your Supabase database needs the team-invites migration. Run the updated supabase/demo_data_migration.sql in the Supabase SQL Editor, then refresh this page."
          : `Could not load workspace profiles: ${profileError.message}`);
        setLoading(false);
        return;
      }
      const activeProfiles = (profileData ?? []) as Profile[];
      const me = activeProfiles.find((profile) => profile.id === authData.user.id);
      if (!me) {
        setLoadError("Your account does not have an active DayTrack profile. Ask an admin to check your workspace access.");
        setLoading(false);
        return;
      }
      me.email = authData.user.email;
      const { data: itemData, error: itemError } = await client.from("items").select("*").order("created_at", { ascending: false });
      if (itemError) {
        setLoadError(`Could not load workspace items: ${itemError.message}`);
        setLoading(false);
        return;
      }
      const { data: releaseData, error: releaseError } = await client.from("releases").select("id,name,target_date,status,summary,release_notes").in("status", ["planned", "ready", "deploying"]).order("target_date", { ascending: true, nullsFirst: false }).limit(1).maybeSingle();
      if (releaseError) {
        setLoadError(`Could not load releases: ${releaseError.message}`);
        setLoading(false);
        return;
      }
      const { data: settingData, error: settingsError } = await client.from("workspace_settings").select("demo_loaded_at").eq("id", 1).maybeSingle();
      if (settingsError) {
        setLoadError(`Run supabase/demo_data_migration.sql in the Supabase SQL Editor, then refresh. Details: ${settingsError.message}`);
        setLoading(false);
        return;
      }
      if (!mounted) return;
      setCurrentUser(me);
      setProfiles(activeProfiles);
      setNewAssignee(me.id);
      setItems((itemData ?? []).map((row) => mapDatabaseItem(row as Record<string, unknown>, activeProfiles)));
      setActiveRelease(releaseData as AppRelease | null);
      const hasDemo = Boolean(settingData?.demo_loaded_at);
      setDemoLoaded(hasDemo);
      if (me.role === "admin" && !hasDemo) setDemoPromptOpen(true);
      const now = new Date();
      setToday(localDateValue(now));
      setTodayLabel(now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase());
      setHeaderDate(now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "2-digit" }).toUpperCase());
      setLoading(false);
    };
    void initialize().catch((error: unknown) => {
      console.error("Failed to initialize DayTrack", error);
      if (mounted) {
        setLoadError(error instanceof Error ? error.message : "Unexpected error loading DayTrack.");
        setLoading(false);
      }
    });
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setModal(true); }
      else if (event.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) { event.preventDefault(); setModal(true); }
      else if (event.key === "Escape") { setModal(false); setInviteOpen(false); setSelected(null); setProfileMenuOpen(false); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); document.getElementById("item-search")?.focus(); }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("pointerdown", handlePointerDown);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => console.error("Service worker registration failed", error));
    }
    const permissionTimer = window.setTimeout(() => {
      if (!("Notification" in window)) setNotificationState("unsupported");
      else if (Notification.permission === "granted") setNotificationState("enabled");
      else if (Notification.permission === "denied") setNotificationState("denied");
    }, 0);
    return () => { mounted = false; window.clearTimeout(permissionTimer); window.removeEventListener("keydown", handleKey); document.removeEventListener("pointerdown", handlePointerDown); };
  }, [router]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const loadDemoData = async () => {
    const client = createClient();
    if (!client || currentUser?.role !== "admin") return;
    setLoadingDemo(true);
    const { error } = await client.rpc("load_demo_data_once");
    setLoadingDemo(false);
    if (error) {
      notify(`Could not load demo data: ${error.message}`);
      return;
    }
    setDemoPromptOpen(false);
    notify("Demo workspace data loaded");
    window.location.reload();
  };

  const inviteMember = async () => {
    setInviting(true);
    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: inviteName, email: inviteEmail, role: inviteRole }),
      });
      const result = await response.json() as { error?: string; member?: Profile };
      if (!response.ok || !result.member) {
        notify(result.error ?? "Could not invite teammate");
        return;
      }
      setProfiles((current) => [...current.filter((profile) => profile.id !== result.member!.id), result.member!].sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setInviteName("");
      setInviteEmail("");
      setInviteRole("user");
      setInviteOpen(false);
      notify(`Invitation sent to ${result.member.email}`);
    } catch (error) {
      console.error("Team invitation failed", error);
      notify("Could not send invitation. Check your connection and try again.");
    } finally {
      setInviting(false);
    }
  };

  const signOut = async () => {
    const client = createClient();
    if (!client) {
      notify("Connect Supabase before signing out");
      return;
    }
    setSigningOut(true);
    const { error } = await client.auth.signOut();
    setSigningOut(false);
    if (error) {
      notify(`Could not sign out: ${error.message}`);
      return;
    }
    router.push("/login");
  };

  useEffect(() => {
    const checkSupabaseReminders = async () => {
      const client = createClient();
      if (!client || !("Notification" in window) || Notification.permission !== "granted") return;
      const { data: authData } = await client.auth.getUser();
      const user = authData.user;
      if (!user) return;
      const { data, error } = await client.from("items").select("id,title,reminder_at,reminder_repeat").lte("reminder_at", new Date().toISOString()).is("reminder_notified_at", null).is("reminder_dismissed_at", null).or(`assignee_id.eq.${user.id},and(assignee_id.is.null,created_by.eq.${user.id})`);
      if (error) { console.error("Unable to check Supabase reminders", error); return; }
      for (const reminder of data ?? []) {
        if ("serviceWorker" in navigator) {
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification("DayTrack reminder", { body: reminder.title });
        } else {
          new Notification("DayTrack reminder", { body: reminder.title });
        }
        const notifiedAt = new Date().toISOString();
        const update = reminder.reminder_repeat === "daily" || reminder.reminder_repeat === "weekly"
          ? { reminder_at: new Date(Date.now() + (reminder.reminder_repeat === "daily" ? 1 : 7) * 86400000).toISOString(), reminder_notified_at: null }
          : { reminder_notified_at: notifiedAt };
        const { error: updateError } = await client.from("items").update(update).eq("id", reminder.id);
        if (updateError) console.error("Unable to record reminder notification", updateError);
        else if (reminder.reminder_repeat === "daily" || reminder.reminder_repeat === "weekly") {
          const nextReminder = String(update.reminder_at);
          setItems((current) => current.map((item) => item.dbId === reminder.id ? { ...item, reminder: nextReminder } : item));
        }
      }
    };
    void checkSupabaseReminders();
    const timer = window.setInterval(() => { void checkSupabaseReminders(); }, 45000);
    return () => window.clearInterval(timer);
  }, [items]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesView = view === "My Items" ? item.assigneeId === currentUser?.id : view === "Notes" ? ["note", "meeting_note", "testing_note"].includes(item.type) : view === "Dashboard" || view === "All Items" || view === "Reminders" ? true : true;
    const matchesQuery = `${item.title} ${item.id} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesType = filter === "All types" || typeNames[item.type] === filter;
    const matchesReminders = view !== "Reminders" || Boolean(item.reminder);
    return matchesView && matchesQuery && matchesType && matchesReminders;
  }), [currentUser?.id, filter, items, query, view]);

  const addItem = async () => {
    if (!title.trim()) return;
    const client = createClient();
    if (!client || !currentUser) { notify("Your Supabase session is not available"); return; }
    const assignee = profiles.find((profile) => profile.id === newAssignee);
    const { data, error } = await client.from("items").insert({
      title: title.trim(),
      type: newType,
      status: "todo",
      priority: newPriority,
      assignee_id: assignee?.id ?? null,
      created_by: currentUser.id,
      ...(newReminder ? { reminder_at: new Date(newReminder).toISOString(), reminder_repeat: newReminderRepeat } : {}),
    }).select("*").single();
    if (error) { notify(`Could not create item: ${error.message}`); return; }
    const item = mapDatabaseItem(data as Record<string, unknown>, profiles);
    setItems((current) => [item, ...current]);
    setTitle(""); setNewReminder(""); setNewReminderRepeat("none"); setModal(false); notify(`${typeNames[newType]} created`);
  };

  const updateStatus = async (item: Item, status: Status) => {
    const client = createClient();
    if (!client) return;
    const { error } = await client.from("items").update({ status }).eq("id", item.dbId);
    if (error) { notify(`Could not update status: ${error.message}`); return; }
    const updated = { ...item, status };
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? updated : candidate));
    setSelected((current) => current?.dbId === item.dbId ? updated : current);
    notify("Status updated");
  };

  const updatePriority = async (item: Item, priority: Priority) => {
    const client = createClient();
    if (!client) return;
    const { error } = await client.from("items").update({ priority }).eq("id", item.dbId);
    if (error) { notify(`Could not update priority: ${error.message}`); return; }
    const updated = { ...item, priority };
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? updated : candidate));
    setSelected((current) => current?.dbId === item.dbId ? updated : current);
    notify("Priority updated");
  };

  const updateDueDate = async (item: Item, dueDate: string) => {
    const client = createClient();
    if (!client) return;
    const value = dueDate || null;
    const { error } = await client.from("items").update({ due_date: value }).eq("id", item.dbId);
    if (error) { notify(`Could not update due date: ${error.message}`); return; }
    const updated = { ...item, dueDate: value, due: formatDueDate(value, today) };
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? updated : candidate));
    setSelected((current) => current?.dbId === item.dbId ? updated : current);
    notify("Due date updated");
  };

  const updateAssignee = async (item: Item, assigneeId: string) => {
    const client = createClient();
    if (!client) return;
    const { error } = await client.from("items").update({ assignee_id: assigneeId || null }).eq("id", item.dbId);
    if (error) { notify(`Could not update assignee: ${error.message}`); return; }
    const profile = profiles.find((candidate) => candidate.id === assigneeId);
    const updated = { ...item, assigneeId: assigneeId || null, assignee: profile?.display_name ?? "Unassigned" };
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? updated : candidate));
    setSelected((current) => current?.dbId === item.dbId ? updated : current);
    notify("Assignee updated");
  };

  const loadComments = useCallback(async (item: Item) => {
    const client = createClient();
    if (!client) return;
    const requestId = ++commentsRequestRef.current;
    setCommentsLoading(true);
    setComments([]);
    setCommentDraft("");
    const { data, error } = await client
      .from("item_comments")
      .select("id,item_id,author_id,body,created_at")
      .eq("item_id", item.dbId)
      .order("created_at", { ascending: true });
    if (requestId !== commentsRequestRef.current) return;
    setCommentsLoading(false);
    if (error) {
      console.error("Unable to load item comments", error);
      notify(`Could not load comments: ${error.message}`);
      return;
    }
    setComments((data ?? []).map((comment) => ({
      ...comment,
      authorName: profiles.find((profile) => profile.id === comment.author_id)?.display_name ?? "Team member",
    })));
  }, [notify, profiles]);

  useEffect(() => {
    if (!selected) {
      commentsRequestRef.current += 1;
      return;
    }
    const timer = window.setTimeout(() => void loadComments(selected), 0);
    return () => window.clearTimeout(timer);
  }, [loadComments, selected]);

  const addComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = commentDraft.trim();
    if (!body || !selected || !currentUser) return;
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    setCommentSubmitting(true);
    const { data, error } = await client
      .from("item_comments")
      .insert({ item_id: selected.dbId, author_id: currentUser.id, body })
      .select("id,item_id,author_id,body,created_at")
      .single();
    setCommentSubmitting(false);
    if (error) {
      notify(`Could not add comment: ${error.message}`);
      return;
    }
    setComments((existing) => [...existing, { ...data, authorName: currentUser.display_name }]);
    setCommentDraft("");
    notify("Comment added");
  };

  const deleteComment = async (comment: ItemComment) => {
    if (comment.author_id !== currentUser?.id) {
      notify("Only the comment author can delete this comment");
      return;
    }
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    const client = createClient();
    if (!client) return;
    const { error } = await client.from("item_comments").delete().eq("id", comment.id);
    if (error) {
      notify(`Could not delete comment: ${error.message}`);
      return;
    }
    setComments((existing) => existing.filter((entry) => entry.id !== comment.id));
    notify("Comment deleted");
  };

  const beginEditComment = (comment: ItemComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentDraft(comment.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentDraft("");
  };

  const saveComment = async (event: React.FormEvent<HTMLFormElement>, comment: ItemComment) => {
    event.preventDefault();
    const body = editingCommentDraft.trim();
    if (!body || body === comment.body || comment.author_id !== currentUser?.id) {
      cancelEditComment();
      return;
    }
    const client = createClient();
    if (!client) return;
    setCommentSaving(true);
    const { error } = await client.from("item_comments").update({ body }).eq("id", comment.id).eq("author_id", currentUser.id);
    setCommentSaving(false);
    if (error) {
      notify(`Could not edit comment: ${error.message}`);
      return;
    }
    setComments((existing) => existing.map((entry) => entry.id === comment.id ? { ...entry, body } : entry));
    cancelEditComment();
    notify("Comment updated");
  };

  const askPermission = async () => {
    if (!("Notification" in window)) { setNotificationState("unsupported"); return; }
    const permission = await Notification.requestPermission();
    setNotificationState(permission === "granted" ? "enabled" : "denied");
    notify(permission === "granted" ? "Browser notifications enabled" : "Notification permission was not granted");
  };

  const toggleComplete = (item: Item) => void updateStatus(item, item.status === "done" ? "todo" : "done");
  const snoozeReminder = async (item: Item, delay: number) => {
    const client = createClient();
    if (!client) return;
    const reminder = new Date(Date.now() + delay).toISOString();
    const { error } = await client.from("items").update({ reminder_at: reminder, reminder_notified_at: null, reminder_dismissed_at: null }).eq("id", item.dbId);
    if (error) { notify(`Could not snooze reminder: ${error.message}`); return; }
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? { ...candidate, reminder } : candidate));
    notify("Reminder snoozed");
  };
  const dismissReminder = async (item: Item) => {
    const client = createClient();
    if (!client) return;
    const { error } = await client.from("items").update({ reminder_dismissed_at: new Date().toISOString() }).eq("id", item.dbId);
    if (error) { notify(`Could not dismiss reminder: ${error.message}`); return; }
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? { ...candidate, reminder: undefined } : candidate));
    notify("Reminder dismissed");
  };

  const myItems = items.filter((item) => item.assigneeId === currentUser?.id);
  const myOpenItems = myItems.filter((item) => item.status !== "done");
  const dueToday = myOpenItems.filter((item) => item.dueDate === today).length;
  const overdue = myOpenItems.filter((item) => item.dueDate && item.dueDate < today).length;
  const inProgress = items.filter((item) => item.status === "in_progress").length;
  const upcomingReminders = items.filter((item) => item.reminder).sort((a, b) => new Date(a.reminder!).getTime() - new Date(b.reminder!).getTime()).slice(0, 2);

  if (loading) return <main className="loading-screen" role="status" aria-live="polite">
    <div className="loading-content">
      <div className="loading-brand"><span className="brand-mark">d.</span><span>daytrack</span></div>
      <span className="loading-spinner" aria-hidden="true" />
      <h1>Loading your workspace</h1>
      <p>Connecting to your DayTrack data…</p>
    </div>
  </main>;
  if (loadError) return <main className="system-page"><div className="system-card"><span className="brand-mark">d.</span><span className="system-code error-code">WORKSPACE CONNECTION</span><h1>We couldn&apos;t load your workspace.</h1><p>{loadError}</p><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></div></main>;
  if (!currentUser) return <main className="system-page"><div className="system-card"><h1>Redirecting to sign in…</h1></div></main>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark">d.</span><span>daytrack</span><span className="brand-beta">TEAM</span></a>
        <button className="workspace-switch"><span className="workspace-avatar">{currentUser.display_name[0]?.toUpperCase() ?? "D"}</span><span className="workspace-copy"><b>Team workspace</b><small>{currentUser.role === "admin" ? "Admin workspace" : "Member workspace"}</small></span><span className="chevron">⌄</span></button>
        <div className="sidebar-scroll">
          <div className="side-section-label">WORKSPACE</div>
          <nav className="nav-list" aria-label="Main navigation">
            {navItems.map((item) => {
              const icon = item === "Dashboard" ? "grid" : item === "My Items" ? "inbox" : item === "All Items" ? "list" : item === "Notes" ? "note" : item === "Releases" ? "rocket" : item === "Reminders" ? "bell" : item === "Team" ? "users" : "settings";
              return <button key={item} onClick={() => { setView(item); setProfileMenuOpen(false); }} className={`nav-link ${view === item ? "active" : ""}`}><Icon name={icon} /><span>{item}</span>{item === "Reminders" && items.some((entry) => entry.reminder) && <span className="nav-count">{items.filter((entry) => entry.reminder).length}</span>}</button>;
            })}
          </nav>
        </div>
        {activeRelease && <div className="release-mini"><div className="mini-release-top"><span className="eyebrow">ACTIVE RELEASE</span><span className="release-dot" /></div><strong>{activeRelease.name}</strong><div className="release-mini-sub">{activeRelease.target_date ? `Target ${formatDueDate(activeRelease.target_date, today)}` : activeRelease.status}</div><button onClick={() => setView("Releases")} className="text-link">View release <Icon name="arrow" size={13} /></button></div>}
        <div className="profile-menu-wrap" ref={profileMenuRef}>
          {profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu"><div className="profile-menu-heading"><span className="avatar avatar-purple">{initials(currentUser.display_name)}</span><span><b>{currentUser.display_name}</b><small>{currentUser.role} account</small></span></div><button role="menuitem" onClick={() => void signOut()} disabled={signingOut}><Icon name="logout" size={14} />{signingOut ? "Signing out..." : "Log out"}</button></div>}
          <button className="profile-row" aria-expanded={profileMenuOpen} aria-haspopup="menu" onClick={() => setProfileMenuOpen((open) => !open)}><span className="avatar avatar-purple">{initials(currentUser.display_name)}</span><span className="profile-copy"><b>{currentUser.display_name}</b><small>{currentUser.role}</small></span><Icon name="more" /></button>
        </div>
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{view}</b></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search" onClick={() => document.getElementById("item-search")?.focus()}><Icon name="search" /></button><button className="icon-button has-dot" aria-label="Notifications" onClick={() => setView("Reminders")}><Icon name="bell" /></button><span className="top-divider" /><span className="today-date">{headerDate}</span><button className="avatar avatar-small avatar-purple">{initials(currentUser.display_name)}</button></div>
        </header>

        <div className="content">
          {view === "Dashboard" ? (
            <>
              <div className="page-heading"><div><div className="eyebrow">{todayLabel}</div><h1>Good morning, {currentUser.display_name.split(" ")[0]} <span className="wave">✳</span></h1><p className="page-subtitle">A clear view of what needs your attention today.</p></div><button className="primary-button" onClick={() => setModal(true)}><Icon name="plus" size={15} /> New item <kbd>N</kbd></button></div>
              <div className="summary-strip">
                <div className="summary-cell"><span className="summary-label">MY OPEN ITEMS</span><strong>{myOpenItems.length}</strong><span className="summary-note">{dueToday} due today</span></div>
                <div className="summary-cell"><span className="summary-label">IN PROGRESS</span><strong>{inProgress}</strong><span className="summary-note"><span className="tiny-green">●</span> Across workspace</span></div>
                <div className="summary-cell"><span className="summary-label">OVERDUE</span><strong className={overdue ? "number-red" : ""}>{overdue}</strong><span className="summary-note">{overdue ? "Needs attention" : "Nothing overdue"}</span></div>
                <div className="summary-cell summary-release"><span className="summary-label">NEXT RELEASE {activeRelease && <span className="release-dot" />}</span><strong>{activeRelease?.name ?? "—"}</strong><span className="summary-note">{activeRelease?.target_date ? formatDueDate(activeRelease.target_date, today) : "No planned release"}</span></div>
              </div>
              <div className="dashboard-grid">
                <section className="panel today-panel">
                  <div className="panel-heading"><div><h2>Today&apos;s focus</h2><span className="panel-caption">Your assigned items due today</span></div><button className="subtle-button" onClick={() => setView("My Items")}>View all <Icon name="arrow" size={13} /></button></div>
                  <div className="focus-list">
                    {myOpenItems.filter((item) => item.dueDate === today).slice(0, 3).map((item) => <FocusRow key={item.id} item={item} onClick={() => setSelected(item)} onComplete={() => toggleComplete(item)} />)}
                    {dueToday === 0 && <div className="empty-inline">Nothing due today. Add an item when something needs your attention.</div>}
                  </div>
                  <button className="add-inline" onClick={() => setModal(true)}><Icon name="plus" size={14} /> Add an item</button>
                </section>
                <section className="panel reminders-panel">
                  <div className="panel-heading"><div><h2>Coming up</h2><span className="panel-caption">Your next reminders</span></div><button className="quiet-icon" aria-label="Reminder options"><Icon name="more" /></button></div>
                  {upcomingReminders.length ? upcomingReminders.map((item) => <button className="reminder-entry reminder-entry-button" key={item.dbId} onClick={() => setSelected(item)}><span className="reminder-time">{new Date(item.reminder!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className="reminder-line" /><span><b>{item.title}</b><small>{formatDueDate(item.reminder!.slice(0, 10))}</small></span><span className="reminder-dot" /></button>) : <div className="empty-inline">No upcoming reminders.</div>}
                  <button className="add-inline" onClick={() => setView("Reminders")}><Icon name="bell" size={14} /> All reminders <span className="inline-count">{items.filter((item) => item.reminder).length}</span></button>
                </section>
                <section className="panel items-panel">
                  <div className="panel-heading"><div><h2>Team activity</h2><span className="panel-caption">Latest updates across your workspace</span></div><button className="subtle-button" onClick={() => setView("All Items")}>All items <Icon name="arrow" size={13} /></button></div>
                  <div className="table-wrap"><table className="items-table"><thead><tr><th>ITEM</th><th>STATUS</th><th>ASSIGNEE</th><th>PRIORITY</th><th>DUE</th></tr></thead><tbody>{items.slice(0, 4).map((item) => <ItemRow key={item.dbId} item={item} onClick={() => setSelected(item)} />)}</tbody></table>{items.length === 0 && <div className="empty-inline">Your workspace is empty. Create the first item.</div>}</div>
                  <button className="table-footer" onClick={() => setView("All Items")}>View all items <Icon name="arrow" size={13} /></button>
                </section>
                {activeRelease && <section className="panel release-panel">
                  <div className="panel-heading"><div><h2>Next release</h2><span className="panel-caption">{activeRelease.target_date ? `Target ${formatDueDate(activeRelease.target_date)}` : "No target date"}</span></div><button className="quiet-icon" onClick={() => setView("Releases")} aria-label="Open release"><Icon name="arrow" /></button></div>
                  <div className="release-summary-body"><b>{activeRelease.name}</b><Label tone={activeRelease.status === "deployed" ? "green" : "blue"}>{activeRelease.status.replace("_", " ")}</Label><p>{activeRelease.summary || "No release summary yet."}</p></div>
                  <button className="table-footer" onClick={() => setView("Releases")}>Open release <Icon name="arrow" size={13} /></button>
                </section>}
              </div>
            </>
          ) : (
            <section className="list-page">
              <div className="page-heading list-heading"><div><div className="eyebrow">WORKSPACE <span className="heading-sep">/</span> {view.toUpperCase()}</div><h1>{view}</h1><p className="page-subtitle">{view === "My Items" ? "Everything assigned to you, in one place." : view === "Releases" ? "Plan deployments and keep every platform in sync." : view === "Reminders" ? "Stay on top of what needs attention." : view === "Notes" ? "Meeting notes, testing notes, and quick thoughts." : "Track the work moving your team forward."}</p></div><button className="primary-button" onClick={() => setModal(true)}><Icon name="plus" size={15} /> New item <kbd>N</kbd></button></div>
              {view === "Releases" ? activeRelease ? <ReleaseView release={activeRelease} /> : <EmptyWorkspace message="No releases yet. An admin can create the first release." /> : view === "Reminders" ? <ReminderList items={items} onSnooze={snoozeReminder} onDismiss={dismissReminder} /> : view === "Team" || view === "Settings" ? <div className="panel simple-panel">
                <div className="team-heading"><div><h2>{view === "Team" ? "Your team" : "Workspace settings"}</h2><p className="panel-caption">{view === "Team" ? "Workspace members and access roles." : "Configure your workspace preferences."}</p></div>{view === "Team" && currentUser.role === "admin" && <button className="primary-button" onClick={() => setInviteOpen(true)}><Icon name="plus" size={14} /> Invite teammate</button>}</div>
                {profiles.map((profile) => <div className="team-row" key={profile.id}><span className="avatar avatar-purple">{initials(profile.display_name)}</span><b>{profile.display_name}</b><Label tone={profile.role === "admin" ? "green" : "neutral"}>{profile.role}</Label><span className="team-email">{profile.email ?? ""}</span></div>)}
                {profiles.length === 0 && <EmptyWorkspace message="No active team members were found." />}
              </div> : <>
                <div className="toolbar"><div className="search-field"><Icon name="search" size={15} /><input id="item-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items..." /><kbd>⌘ F</kbd></div><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter by type"><option>All types</option>{Object.values(typeNames).map((name) => <option key={name}>{name}</option>)}</select><button className="secondary-button" onClick={() => notify("Filters are up to date")}><Icon name="filter" size={14} /> Filter</button><button className="secondary-button" onClick={() => notify("Sorted by most recently updated")}>Updated <span>⌄</span></button><span className="toolbar-count">{filteredItems.length} items</span></div>
                <div className="panel list-panel"><div className="table-wrap"><table className="items-table full-table"><thead><tr><th>ITEM</th><th>TYPE</th><th>STATUS</th><th>ASSIGNEE</th><th>PRIORITY</th><th>DUE DATE</th><th></th></tr></thead><tbody>{filteredItems.map((item) => <ItemRow key={item.id} item={item} onClick={() => setSelected(item)} extended />)}</tbody></table>{filteredItems.length === 0 && <div className="empty-state"><span className="empty-icon"><Icon name="inbox" size={20} /></span><b>No items found</b><p>Try a different search or create a new item.</p><button className="secondary-button" onClick={() => setModal(true)}><Icon name="plus" size={14} /> Create an item</button></div>}</div></div>
              </>}
            </section>
          )}
        </div>
        <div className="quickbar"><button className="quickbar-plus" onClick={() => setModal(true)}><Icon name="plus" size={17} /></button><button className="quickbar-prompt" onClick={() => setModal(true)}>Quick capture <span>Task, issue, note, anything...</span></button><button className="quickbar-shortcut" onClick={() => setModal(true)}><Icon name="command" size={12} /><span>K</span></button></div>
      </section>

      {notificationState === "ask" && <div className="permission-prompt"><span className="permission-icon"><Icon name="bell" /></span><div><b>Never miss a reminder</b><small>Allow browser notifications to get a nudge when things are due.</small></div><button onClick={askPermission}>Enable</button><button className="prompt-close" onClick={() => setNotificationState("denied")} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>}
      {notificationState === "denied" && <div className="permission-prompt muted-prompt"><span className="permission-icon"><Icon name="bell" /></span><div><b>Notifications are off</b><small>You can enable them in your browser settings.</small></div><button className="prompt-close" onClick={() => setNotificationState("unsupported")} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>}
      {notificationState === "unsupported" && <div className="permission-prompt muted-prompt"><span className="permission-icon"><Icon name="bell" /></span><div><b>Browser notifications unavailable</b><small>Reminders remain visible in DayTrack.</small></div><button className="prompt-close" onClick={() => setNotificationState("enabled")} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>}

      {currentUser.role === "admin" && demoLoaded === false && demoPromptOpen && <div className="modal-backdrop"><section className="quick-modal demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-title"><div className="modal-header"><div><div className="eyebrow">FIRST-TIME WORKSPACE SETUP</div><h2 id="demo-title">Load sample workspace data?</h2></div></div><p className="demo-copy">Add example items and a release plan to explore DayTrack. This is optional and can be done only once for this workspace. Existing workspace data will be kept.</p><div className="demo-includes"><span>5 sample items</span><span>1 release</span><span>Checklists and release notes</span></div><div className="modal-footer"><button className="secondary-button" onClick={() => setDemoPromptOpen(false)}>Not now</button><button className="primary-button" onClick={() => void loadDemoData()} disabled={loadingDemo}>{loadingDemo ? "Loading sample data..." : "Load demo data"}</button></div></section></div>}

      {inviteOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setInviteOpen(false); }}><form className="quick-modal" onSubmit={(event) => { event.preventDefault(); void inviteMember(); }} aria-labelledby="invite-title"><div className="modal-header"><div><div className="eyebrow">TEAM ACCESS</div><h2 id="invite-title">Invite a teammate</h2></div><button className="quiet-icon" type="button" onClick={() => setInviteOpen(false)} aria-label="Close"><Icon name="close" /></button></div><p className="invite-description">We&apos;ll send an email invitation so they can securely join your workspace.</p><label className="form-label" htmlFor="invite-name">Name<input id="invite-name" className="title-input" autoFocus required maxLength={100} value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Teammate name" /></label><label className="form-label invite-field" htmlFor="invite-email">Email address<input id="invite-email" type="email" required className="title-input" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" /></label><label className="form-label invite-field" htmlFor="invite-role">Role<select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "user" | "admin")}><option value="user">User</option><option value="admin">Admin</option></select></label><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={inviting}>{inviting ? "Sending invite..." : "Send invitation"}</button></div></form></div>}

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}><section className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-title"><div className="modal-header"><div><div className="eyebrow">QUICK CAPTURE</div><h2 id="quick-title">New item</h2></div><button className="quiet-icon" onClick={() => setModal(false)} aria-label="Close"><Icon name="close" /></button></div><label className="form-label" htmlFor="item-title">What needs to get done?</label><input id="item-title" autoFocus className="title-input" placeholder="Give it a short, clear title..." value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }} /><div className="form-grid"><label className="form-label">Type<select value={newType} onChange={(event) => setNewType(event.target.value as ItemType)}>{Object.entries(typeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><label className="form-label">Priority<select value={newPriority} onChange={(event) => setNewPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="form-label">Assignee<select value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)}><option value="">Unassigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></label><label className="form-label">Reminder<input type="datetime-local" value={newReminder} onChange={(event) => setNewReminder(event.target.value)} /></label><label className="form-label">Repeat<select value={newReminderRepeat} onChange={(event) => setNewReminderRepeat(event.target.value as "none" | "daily" | "weekly")}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label></div><div className="modal-footer"><span className="shortcut-hint">Press <kbd>Enter</kbd> to create</span><button className="secondary-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" onClick={() => void addItem()} disabled={!title.trim()}><Icon name="plus" size={14} /> Create item</button></div></section></div>}
      {selected && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
        <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="Item details">
          <div className="drawer-top"><span className="item-id">{selected.id}</span><div className="drawer-actions"><button className="quiet-icon" aria-label="Close item" onClick={() => setSelected(null)}><Icon name="close" /></button></div></div>
          <div className="drawer-title-row"><span className={`type-mark ${selected.type}`}>{selected.type === "issue" ? "!" : selected.type === "task" ? "✓" : "≡"}</span><h2>{selected.title}</h2></div>
          <div className="drawer-properties">
            <div><span>Status</span><select value={selected.status} onChange={(event) => void updateStatus(selected, event.target.value as Status)}>{Object.entries(statusNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>
            <div><label htmlFor="item-priority">Priority</label><select id="item-priority" className={`priority-select priority-${selected.priority}`} value={selected.priority} onChange={(event) => void updatePriority(selected, event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div><span>Assignee</span><select value={selected.assigneeId ?? ""} onChange={(event) => void updateAssignee(selected, event.target.value)}><option value="">Unassigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></div>
            <div><label htmlFor="item-due-date">Due date</label><input id="item-due-date" className="drawer-date-input" type="date" value={selected.dueDate ?? ""} onChange={(event) => void updateDueDate(selected, event.target.value)} /></div>
          </div>
          <div className="drawer-section"><div className="section-title">Description</div><p className="description-text">{selected.body || "No description provided."}</p></div>
          <div className="drawer-section">
            <div className="section-title">Comments <span className="comment-count">{comments.length}</span></div>
            {commentsLoading ? <div className="comments-loading">Loading comments…</div> : comments.length > 0 ? <div className="comment-list">
              {comments.map((comment) => <article className="comment-entry" key={comment.id}>
                <span className="avatar avatar-small avatar-purple">{initials(comment.authorName)}</span>
                <div className="comment-content"><div className="comment-meta"><b>{comment.authorName}</b><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></div>
                  {editingCommentId === comment.id
                    ? <form className="comment-edit-form" onSubmit={(event) => void saveComment(event, comment)}><textarea aria-label="Edit comment" maxLength={5000} rows={3} value={editingCommentDraft} onChange={(event) => setEditingCommentDraft(event.target.value)} /><div className="comment-edit-actions"><button type="button" className="comment-cancel" onClick={cancelEditComment}>Cancel</button><button type="submit" className="comment-save" disabled={commentSaving || !editingCommentDraft.trim()}>{commentSaving ? "Saving..." : "Save"}</button></div></form>
                    : <p>{comment.body}</p>}
                </div>
                {comment.author_id === currentUser.id && editingCommentId !== comment.id && <div className="comment-actions"><button className="comment-icon-button" onClick={() => beginEditComment(comment)} aria-label="Edit comment" title="Edit comment"><Icon name="edit" size={14} /></button><button className="comment-icon-button comment-icon-danger" onClick={() => void deleteComment(comment)} aria-label="Delete comment" title="Delete comment"><Icon name="trash" size={14} /></button></div>}
              </article>)}
            </div> : <p className="comments-empty">No comments yet. Add a note or progress update.</p>}
            <form className="comment-form" onSubmit={(event) => void addComment(event)}>
              <label className="sr-only" htmlFor="comment-draft">Write a comment</label>
              <textarea id="comment-draft" maxLength={5000} rows={2} placeholder="Write a comment or progress update..." value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} />
              <div className="comment-form-footer"><span>{commentDraft.length}/5000</span><button className="primary-button" type="submit" disabled={commentSubmitting || !commentDraft.trim()}>{commentSubmitting ? "Sending..." : "Comment"}</button></div>
            </form>
          </div>
        </aside>
      </div>}
      {toast && <div className="toast"><span className="toast-check"><Icon name="check" size={13} /></span>{toast}</div>}
    </main>
  );
}

function FocusRow({ item, onClick, onComplete }: { item: Item; onClick: () => void; onComplete: () => void }) {
  return <div className="focus-row"><button className="checkbox" onClick={onComplete} aria-label={`Complete ${item.title}`} /><button className="focus-title" onClick={onClick}><b>{item.title}</b><span>{item.id} <i>·</i> {item.assignee}</span></button><Label tone={item.priority}>{item.priority}</Label></div>;
}

function ReminderList({ items, onSnooze, onDismiss }: { items: Item[]; onSnooze: (item: Item, delay: number) => void; onDismiss: (item: Item) => void }) {
  const reminders = items.filter((item) => item.reminder).sort((a, b) => new Date(a.reminder!).getTime() - new Date(b.reminder!).getTime());
  return <div className="panel reminder-list">{reminders.length ? reminders.map((item) => <div className="reminder-list-row" key={item.id}><span className="reminder-list-icon"><Icon name="bell" size={15} /></span><div className="reminder-list-title"><b>{item.title}</b><small>{new Date(item.reminder!).toLocaleString()} · {item.assignee}</small></div><div className="reminder-controls"><button onClick={() => onSnooze(item, 10 * 60 * 1000)}>10 min</button><button onClick={() => onSnooze(item, 60 * 60 * 1000)}>1 hr</button><button onClick={() => onSnooze(item, 24 * 60 * 60 * 1000)}>Tomorrow</button><button onClick={() => onDismiss(item)}>Dismiss</button></div></div>) : <div className="empty-state"><span className="empty-icon"><Icon name="bell" size={20} /></span><b>You&apos;re all caught up</b><p>Add a reminder to any item and it will show up here.</p></div>}</div>;
}

function ItemRow({ item, onClick, extended = false }: { item: Item; onClick: () => void; extended?: boolean }) {
  const typeTone = item.type === "issue" ? "red" : item.type === "task" ? "blue" : "neutral";
  const statusTone = item.status === "done" ? "green" : item.status === "blocked" ? "red" : item.status === "in_progress" ? "blue" : "neutral";
  return <tr onClick={onClick} className="item-row"><td><div className="item-name"><span className={`type-mark ${item.type}`}>{item.type === "issue" ? "!" : item.type === "task" ? "✓" : "≡"}</span><span><b>{item.title}</b><small>{item.id}{item.tags.length > 0 && <> <i>·</i> {item.tags.map((tag) => `#${tag}`).join(" ")}</>}</small></span></div></td>{extended && <td><Label tone={typeTone}>{typeNames[item.type]}</Label></td>}<td><Label tone={statusTone}><span className="status-dot" />{statusNames[item.status]}</Label></td><td><span className="assignee"><span className="avatar avatar-tiny avatar-purple">{initials(item.assignee)}</span>{item.assignee}</span></td><td><Label tone={item.priority}>{item.priority}</Label></td><td className={item.due === "Today" ? "due-today" : ""}>{item.due}</td>{extended && <td><button className="row-more" aria-label="More actions" onClick={(event) => event.stopPropagation()}><Icon name="more" /></button></td>}</tr>;
}

function ReleaseView({ release }: { release: AppRelease }) {
  return <div className="panel real-release-view">
    <div className="release-title"><span className="release-tag">{release.status.replace("_", " ").toUpperCase()}</span><h2>{release.name}</h2><p>{release.summary || "No summary added for this release."}</p></div>
    <div className="release-date"><span className="summary-label">TARGET DATE</span><b>{release.target_date ? formatDueDate(release.target_date) : "Not set"}</b></div>
    <section className="release-notes-section"><h2>Release notes</h2><p>{release.release_notes || "No release notes added yet."}</p></section>
  </div>;
}

function EmptyWorkspace({ message }: { message: string }) {
  return <div className="panel empty-workspace"><span className="empty-icon"><Icon name="inbox" size={20} /></span><p>{message}</p></div>;
}
