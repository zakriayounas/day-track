"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordVisibilityButton from "@/components/password-visibility-button";

type ItemType = "task" | "issue" | "note" | "meeting_note" | "testing_note" | "release_note";
type Status = "todo" | "in_progress" | "blocked" | "done";
type Priority = "low" | "medium" | "high" | "urgent";
type Item = {
  id: string;
  dbId: string;
  createdAt: string;
  assigneeId: string | null;
  creatorId: string;
  dueDate: string | null;
  title: string;
  type: ItemType;
  releaseId: string | null;
  platformIds: string[];
  sortOrder: number;
  testSteps: string;
  shareToken: string | null;
  publicEnabled: boolean;
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
type AppPlatform = { id: string; name: string; description: string | null; is_active: boolean };
type AppRelease = { id: string; name: string; target_date: string | null; status: string; summary: string | null; release_notes: string | null; public_token: string | null; public_enabled: boolean; platformIds: string[] };
type ItemComment = { id: string; item_id: string; author_id: string | null; body: string; created_at: string; authorName: string; source: "team" | "guest" };

const typeNames: Record<ItemType, string> = { task: "Task", issue: "Issue", note: "Note", meeting_note: "Meeting note", testing_note: "Testing note", release_note: "Release note" };
const statusNames: Record<Status, string> = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" };
const viewPaths = {
  Dashboard: "/dashboard",
  "My Items": "/my-items",
  "All Items": "/items",
  Notes: "/notes",
  Releases: "/releases",
  Reminders: "/reminders",
  Team: "/team",
  Profile: "/profile",
  Settings: "/settings",
} as const;
type WorkspaceView = keyof typeof viewPaths;
const pathViews = Object.fromEntries(Object.entries(viewPaths).map(([view, path]) => [path, view])) as Record<string, WorkspaceView>;
const navItems: WorkspaceView[] = ["Dashboard", "My Items", "All Items", "Notes", "Releases", "Reminders", "Team", "Settings"];
const filterFields = [
  { id: "search", label: "Search" },
  { id: "type", label: "Type" },
  { id: "assignee", label: "Assignee" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "dueDate", label: "Due date" },
  { id: "release", label: "Release" },
  { id: "platform", label: "Platform" },
] as const;
type FilterField = (typeof filterFields)[number]["id"];
const defaultVisibleFilters: FilterField[] = ["search", "assignee", "status"];
const filterPreferenceKey = "daytrack:item-filter-fields:v2";

function getVisibleFilterPreference(): FilterField[] {
  if (typeof window === "undefined") return defaultVisibleFilters;
  try {
    const saved = window.localStorage.getItem(filterPreferenceKey);
    if (!saved) return defaultVisibleFilters;
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return defaultVisibleFilters;
    return [...new Set(parsed.filter((field): field is FilterField => filterFields.some((option) => option.id === field)))];
  } catch (error) {
    console.error("Could not load filter visibility preferences", error);
    return defaultVisibleFilters;
  }
}

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
    chevronDown: <path d="m6 9 6 6 6-6" />,
    chevronUp: <path d="m6 15 6-6 6 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    grip: <><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /></>,
    share: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 12v7h14v-7" /></>,
    command: <><path d="M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7z" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.list}</svg>;
}

function PlatformMultiSelect({ id, platforms, selectedIds, disabled, onChange }: { id: string; platforms: AppPlatform[]; selectedIds: string[]; disabled?: boolean; onChange: (platformIds: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedPlatforms = platforms.filter((platform) => selectedIds.includes(platform.id));
  const togglePlatform = (platformId: string, checked: boolean) => {
    onChange(checked
      ? [...new Set([...selectedIds, platformId])]
      : selectedIds.filter((selectedId) => selectedId !== platformId));
  };
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);
  return <div className="platform-picker" ref={pickerRef}>
    <div className={`platform-picker-control${selectedPlatforms.length ? " has-selections" : ""}`}>
      {selectedPlatforms.map((platform) => <span className="platform-selected-chip" key={platform.id}>{platform.name}<button type="button" aria-label={`Remove ${platform.name}`} disabled={disabled} onClick={() => togglePlatform(platform.id, false)}><Icon name="close" size={11} /></button></span>)}
      <button className="platform-picker-trigger" type="button" aria-expanded={open} aria-controls={`${id}-options`} disabled={disabled || platforms.length === 0} onClick={() => setOpen((current) => !current)}><span>{selectedPlatforms.length ? "Add platform" : platforms.length ? "Select platforms" : "No platforms available"}</span><Icon name="chevronDown" size={13} /></button>
    </div>
    {open && <div className="platform-picker-options" id={`${id}-options`} role="group" aria-label="Available platforms">
      {platforms.map((platform) => {
        const checked = selectedIds.includes(platform.id);
        return <label className={`platform-picker-option${checked ? " selected" : ""}`} key={platform.id} htmlFor={`${id}-${platform.id}`}>
          <input id={`${id}-${platform.id}`} type="checkbox" checked={checked} onChange={(event) => togglePlatform(platform.id, event.target.checked)} />
          <span>{platform.name}</span>
        </label>;
      })}
      {selectedIds.length > 0 && <button className="platform-picker-clear" type="button" onClick={() => onChange([])}>Clear selection</button>}
    </div>}
  </div>;
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
  const relatedPlatformIds = Array.isArray(row.item_platforms)
    ? (row.item_platforms as { platform_id?: unknown }[]).flatMap((platform) => typeof platform.platform_id === "string" ? [platform.platform_id] : [])
    : [];
  return {
    id: String(row.reference),
    dbId: String(row.id),
    createdAt: String(row.created_at ?? ""),
    assigneeId,
    creatorId,
    dueDate: typeof row.due_date === "string" ? row.due_date : null,
    title: String(row.title),
    type: row.type as ItemType,
    releaseId: typeof row.release_id === "string" ? row.release_id : null,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    platformIds: relatedPlatformIds.length > 0
      ? relatedPlatformIds
      : typeof row.platform_id === "string" ? [row.platform_id] : [],
    testSteps: String(row.test_steps ?? ""),
    shareToken: typeof row.public_token === "string" ? row.public_token : null,
    publicEnabled: row.public_enabled === true,
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

function dateTimeLocalValue(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

export default function DayTrack() {
  const router = useRouter();
  const pathname = usePathname();
  const view: WorkspaceView = pathname === "/" ? "Dashboard" : pathViews[pathname] ?? "Dashboard";
  const setView = (nextView: WorkspaceView) => router.push(viewPaths[nextView]);
  const [items, setItems] = useState<Item[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [releases, setReleases] = useState<AppRelease[]>([]);
  const [platforms, setPlatforms] = useState<AppPlatform[]>([]);
  const [platformName, setPlatformName] = useState("");
  const [platformDescription, setPlatformDescription] = useState("");
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [platformSavingId, setPlatformSavingId] = useState<string | null>(null);
  const [platformModalOpen, setPlatformModalOpen] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);
  const [reorderingItems, setReorderingItems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [demoLoaded, setDemoLoaded] = useState<boolean | null>(null);
  const [demoPromptOpen, setDemoPromptOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [dismissingDemoPrompt, setDismissingDemoPrompt] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const [inviting, setInviting] = useState(false);
  const [today, setToday] = useState("");
  const [todayLabel, setTodayLabel] = useState("");
  const [headerDate, setHeaderDate] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All types");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("any");
  const [releaseFilter, setReleaseFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [visibleFilters, setVisibleFilters] = useState<FilterField[]>(getVisibleFilterPreference);
  const filterPreferencesReadyRef = useRef(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [modal, setModalState] = useState(false);
  const [releaseModal, setReleaseModal] = useState(false);
  const [releaseEditModal, setReleaseEditModal] = useState(false);
  const [releaseName, setReleaseName] = useState("");
  const [releaseTargetDate, setReleaseTargetDate] = useState("");
  const [releaseSummary, setReleaseSummary] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [releasePlatformIds, setReleasePlatformIds] = useState<string[]>([]);
  const [creatingRelease, setCreatingRelease] = useState(false);
  const [savingReleaseDetails, setSavingReleaseDetails] = useState(false);
  const [editingReleaseId, setEditingReleaseId] = useState<string | null>(null);
  const [releaseActionId, setReleaseActionId] = useState<string | null>(null);
  const [releasePendingClose, setReleasePendingClose] = useState<AppRelease | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [sharingTask, setSharingTask] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [titleDraft, setTitleDraft] = useState<{ itemId: string; value: string } | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<{ itemId: string; value: string } | null>(null);
  const [testStepsDraft, setTestStepsDraft] = useState<{ itemId: string; value: string } | null>(null);
  const [tagDraft, setTagDraft] = useState<{ itemId: string; value: string } | null>(null);
  const [toast, setToast] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const commentsRequestRef = useRef(0);
  const [notificationState, setNotificationState] = useState<"ask" | "enabled" | "denied" | "unsupported">("ask");
  const [title, setTitle] = useState("");
  const [itemBody, setItemBody] = useState("");
  const [itemTestSteps, setItemTestSteps] = useState("");
  const [newType, setNewType] = useState<ItemType>("task");
  const [newReleaseId, setNewReleaseId] = useState("");
  const [newPlatformIds, setNewPlatformIds] = useState<string[]>([]);
  const [newPriority, setNewPriority] = useState<Priority>("medium");
  const [newAssignee, setNewAssignee] = useState("");
  const [newReminder, setNewReminder] = useState("");
  const [newReminderRepeat, setNewReminderRepeat] = useState<"none" | "daily" | "weekly">("none");
  const [profileName, setProfileName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!filterPreferencesReadyRef.current) {
      filterPreferencesReadyRef.current = true;
      return;
    }
    try {
      window.localStorage.setItem(filterPreferenceKey, JSON.stringify(visibleFilters));
    } catch (error) {
      console.error("Could not save filter visibility preferences", error);
    }
  }, [visibleFilters]);

  const closeSelected = useCallback(() => {
    setSelected(null);
    const currentPath = window.location.pathname;
    if ((currentPath === viewPaths["All Items"] || currentPath === viewPaths.Notes) && new URLSearchParams(window.location.search).has("item")) {
      router.replace(currentPath, { scroll: false });
    }
  }, [router]);

  const openItemDetails = (item: Item) => {
    const canonicalItem = items.find((entry) => entry.dbId === item.dbId) ?? item;
    setSelected(canonicalItem);
    setTitleDraft(null);
    setDescriptionDraft(null);
    setTestStepsDraft(null);
    setTagDraft(null);
    setEditingCommentId(null);
    setEditingCommentDraft("");
    setCommentDraft("");
  };

  const setModal = useCallback((open: boolean) => {
    if (!open) {
      setNewReleaseId("");
      setItemBody("");
      setItemTestSteps("");
      setNewType("task");
    }
    setModalState(open);
  }, []);

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
      const { data: itemData, error: itemError } = await client.from("items").select("*,item_platforms(platform_id)").order("sort_order").order("created_at", { ascending: false });
      if (itemError) {
        const missingOrderingColumn = itemError.message.includes("sort_order");
        if (missingOrderingColumn) {
          setLoadError(`Could not load workspace items because manual ordering is not set up in Supabase. Run supabase/item_ordering_migration.sql in the SQL Editor, then refresh. Details: ${itemError.message}`);
          setLoading(false);
          return;
        }
        const missingPlatformRelation = itemError.message.includes("item_platforms")
          && itemError.message.includes("relationship");
        setLoadError(missingPlatformRelation
          ? `Could not load workspace items because the item-platform relationship is missing from Supabase. Run supabase/item_platforms_migration.sql in the SQL Editor, then refresh. Details: ${itemError.message}`
          : `Could not load workspace items: ${itemError.message}`);
        setLoading(false);
        return;
      }
      const { data: releaseData, error: releaseError } = await client.from("releases").select("id,name,target_date,status,summary,release_notes,public_token,public_enabled").order("target_date", { ascending: true, nullsFirst: false });
      if (releaseError) {
        setLoadError(`Could not load releases: ${releaseError.message}`);
        setLoading(false);
        return;
      }
      const { data: releasePlatformData, error: releasePlatformsError } = await client.from("release_platforms").select("release_id,platform_id");
      if (releasePlatformsError) {
        setLoadError(`Could not load release platforms: ${releasePlatformsError.message}`);
        setLoading(false);
        return;
      }
      const { data: platformData, error: platformError } = await client.from("platforms").select("id,name,description,is_active").order("name");
      if (platformError) {
        setLoadError(`Could not load workspace platforms: ${platformError.message}`);
        setLoading(false);
        return;
      }
      const { data: settingData, error: settingsError } = await client.from("workspace_settings").select("demo_loaded_at,demo_prompt_dismissed_at").eq("id", 1).maybeSingle();
      if (settingsError) {
        setLoadError(`Run supabase/demo_data_migration.sql in the Supabase SQL Editor, then refresh. Details: ${settingsError.message}`);
        setLoading(false);
        return;
      }
      if (!mounted) return;
      setCurrentUser(me);
      setProfiles(activeProfiles);
      setProfileName(me.display_name);
      setNewAssignee(me.id);
      const loadedItems = (itemData ?? []).map((row) => mapDatabaseItem(row as Record<string, unknown>, activeProfiles));
      setItems(loadedItems);
      if (pathname === viewPaths["All Items"] || pathname === viewPaths.Notes) {
        const itemId = new URLSearchParams(window.location.search).get("item");
        const selectedItem = loadedItems.find((item) => item.dbId === itemId || item.id === itemId);
        if (selectedItem) setSelected(selectedItem);
      }
      const releasePlatformsById = new Map<string, string[]>();
      for (const assignment of releasePlatformData ?? []) {
        const platformIds = releasePlatformsById.get(assignment.release_id) ?? [];
        platformIds.push(assignment.platform_id);
        releasePlatformsById.set(assignment.release_id, platformIds);
      }
      setReleases((releaseData ?? []).map((release) => ({ ...release, platformIds: releasePlatformsById.get(release.id) ?? [] })) as AppRelease[]);
      setPlatforms((platformData ?? []) as AppPlatform[]);
      const hasDemo = Boolean(settingData?.demo_loaded_at);
      setDemoLoaded(hasDemo);
      if (me.role === "admin" && !hasDemo && !settingData?.demo_prompt_dismissed_at) setDemoPromptOpen(true);
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
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
      if (!filterMenuRef.current?.contains(event.target as Node)) setFilterMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => console.error("Service worker registration failed", error));
    }
    const permissionTimer = window.setTimeout(() => {
      if (!("Notification" in window)) setNotificationState("unsupported");
      else if (Notification.permission === "granted") setNotificationState("enabled");
      else if (Notification.permission === "denied") setNotificationState("denied");
    }, 0);
    return () => { mounted = false; window.clearTimeout(permissionTimer); document.removeEventListener("pointerdown", handlePointerDown); };
  }, [pathname, router]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setModal(true); }
      else if (event.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) { event.preventDefault(); setModal(true); }
      else if (event.key === "Escape") { setModal(false); setReleaseModal(false); setReleaseEditModal(false); setReleasePendingClose(null); setInviteOpen(false); setPlatformModalOpen(false); if (globalSearchOpen) setGlobalSearchOpen(false); else closeSelected(); setProfileMenuOpen(false); setFilterMenuOpen(false); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); setGlobalSearchOpen(true); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeSelected, globalSearchOpen, setModal]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const openItemModal = (releaseId: string | null = null, type: ItemType = "task") => {
    if (releaseId && releases.find((release) => release.id === releaseId)?.status === "closed") {
      notify("This release is closed and cannot accept new items");
      return;
    }
    setNewReleaseId(releaseId ?? "");
    setNewPlatformIds([]);
    setNewType(type);
    setItemBody("");
    setItemTestSteps("");
    setModal(true);
  };

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

  const dismissDemoPrompt = async () => {
    const client = createClient();
    if (!client || currentUser?.role !== "admin") return;
    setDismissingDemoPrompt(true);
    const { error } = await client.rpc("dismiss_demo_prompt_once");
    setDismissingDemoPrompt(false);
    if (error) {
      notify(`Could not save setup choice: ${error.message}`);
      return;
    }
    setDemoPromptOpen(false);
  };

  const toggleTaskSharing = async (item: Item) => {
    const client = createClient();
    if (!client || !currentUser) { notify("Supabase connection is unavailable"); return; }
    setSharingTask(true);
    const { data: token, error } = await client.rpc("set_item_public_share", {
      item_id: item.dbId,
      enable_share: !item.publicEnabled,
    });
    setSharingTask(false);
    if (error) {
      notify(`Could not update public link: ${error.message}`);
      return;
    }
    const updated = { ...item, shareToken: typeof token === "string" ? token : null, publicEnabled: !item.publicEnabled };
    setItems((existing) => existing.map((entry) => entry.dbId === item.dbId ? updated : entry));
    setSelected((existing) => existing?.dbId === item.dbId ? updated : existing);
    if (updated.publicEnabled && updated.shareToken) {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/t/${updated.shareToken}`);
        notify("Public task link created and copied");
      } catch {
        notify("Public task link created. Copy the link shown below.");
      }
    } else {
      notify("Public task link disabled");
    }
  };

  const shareTask = async (item: Item) => {
    if (!item.publicEnabled || !item.shareToken) {
      await toggleTaskSharing(item);
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/t/${item.shareToken}`);
      notify("Public task link copied");
    } catch (error) {
      console.error("Could not copy public task link", error);
      notify("Could not copy the link. Select and copy it below.");
    }
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

  const addPlatform = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (currentUser?.role !== "admin" || !platformName.trim()) return;
    const client = createClient();
    if (!client) { notify("Your Supabase session is not available"); return; }
    setAddingPlatform(true);
    const { data, error } = await client.from("platforms").insert({
      name: platformName.trim(),
      description: platformDescription.trim() || null,
    }).select("id,name,description,is_active").single();
    setAddingPlatform(false);
    if (error) { notify(`Could not add platform: ${error.message}`); return; }
    setPlatforms((current) => [...current, data as AppPlatform].sort((a, b) => a.name.localeCompare(b.name)));
    setPlatformName("");
    setPlatformDescription("");
    setPlatformModalOpen(false);
    notify("Platform added");
  };

  const togglePlatform = async (platform: AppPlatform) => {
    if (currentUser?.role !== "admin") return;
    const client = createClient();
    if (!client) { notify("Your Supabase session is not available"); return; }
    setPlatformSavingId(platform.id);
    const { error } = await client.from("platforms").update({ is_active: !platform.is_active }).eq("id", platform.id);
    setPlatformSavingId(null);
    if (error) { notify(`Could not update platform: ${error.message}`); return; }
    setPlatforms((current) => current.map((entry) => entry.id === platform.id ? { ...entry, is_active: !platform.is_active } : entry));
    notify(platform.is_active ? "Platform deactivated" : "Platform activated");
  };

  const reorderItems = async (targetItemId: string) => {
    const sourceItemId = draggedItemId;
    setDraggedItemId(null);
    setDragOverItemId(null);
    if (!sourceItemId || sourceItemId === targetItemId || reorderingItems) return;
    const previousItems = items;
    const previousSortOrder = new Map(items.map((item) => [item.dbId, item.sortOrder]));
    const reordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const sourceIndex = reordered.findIndex((item) => item.dbId === sourceItemId);
    const targetIndex = reordered.findIndex((item) => item.dbId === targetItemId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedItem] = reordered.splice(sourceIndex, 1);
    reordered.splice(reordered.findIndex((item) => item.dbId === targetItemId), 0, movedItem);
    const orderedItems = reordered.map((item, index) => ({ ...item, sortOrder: index }));
    setItems(orderedItems);
    const client = createClient();
    if (!client) {
      setItems(previousItems);
      notify("Supabase connection is unavailable; item order was not saved.");
      return;
    }
    setReorderingItems(true);
    const { error } = await client.rpc("reorder_items", { ordered_item_ids: orderedItems.map((item) => item.dbId) });
    setReorderingItems(false);
    if (error) {
      setItems((current) => current.map((item) => ({
        ...item,
        sortOrder: previousSortOrder.get(item.dbId) ?? item.sortOrder,
      })).sort((a, b) => a.sortOrder - b.sortOrder));
      notify(`Could not save item order: ${error.message}`);
      return;
    }
    notify("Item order saved for the workspace");
  };

  const saveProfileName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const displayName = profileName.trim();
    if (!displayName || displayName.length > 100 || !currentUser) return;
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    setProfileSaving(true);
    const { error } = await client.rpc("update_my_display_name", { new_display_name: displayName });
    setProfileSaving(false);
    if (error) { notify(`Could not update your name: ${error.message}`); return; }
    const updatedUser = { ...currentUser, display_name: displayName };
    setCurrentUser(updatedUser);
    setProfiles((existing) => existing.map((profile) => profile.id === currentUser.id ? updatedUser : profile));
    setComments((existing) => existing.map((comment) => comment.author_id === currentUser.id ? { ...comment, authorName: displayName } : comment));
    setProfileName(displayName);
    notify("Profile name updated");
  };

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordDraft.length < 8) { notify("Use a password with at least 8 characters"); return; }
    if (passwordDraft !== passwordConfirmation) { notify("The passwords do not match"); return; }
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    setPasswordSaving(true);
    const { error } = await client.auth.updateUser({ password: passwordDraft });
    setPasswordSaving(false);
    if (error) { notify(`Could not update your password: ${error.message}`); return; }
    setPasswordDraft("");
    setPasswordConfirmation("");
    notify("Password updated");
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

  const nextSevenDays = useMemo(() => {
    if (!today) return "";
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() + 7);
    return localDateValue(date);
  }, [today]);

  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesView = view === "My Items" ? item.assigneeId === currentUser?.id : view === "Notes" ? ["note", "meeting_note", "testing_note", "release_note"].includes(item.type) : view === "Dashboard" || view === "All Items" || view === "Reminders" ? true : true;
    const matchesQuery = `${item.title} ${item.id} ${item.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesType = filter === "All types" || typeNames[item.type] === filter;
    const matchesReminders = view !== "Reminders" || Boolean(item.reminder);
    const matchesAssignee = assigneeFilter === "all" || item.assigneeId === assigneeFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || item.priority === priorityFilter;
    const matchesRelease = releaseFilter === "all" || (releaseFilter === "none" ? !item.releaseId : item.releaseId === releaseFilter);
    const matchesPlatform = platformFilter === "all" || (platformFilter === "none" ? item.platformIds.length === 0 : item.platformIds.includes(platformFilter));
    const dueDate = item.dueDate;
    const matchesDueDate = dueDateFilter === "any"
      || (dueDateFilter === "overdue" && Boolean(dueDate && today && dueDate < today && item.status !== "done"))
      || (dueDateFilter === "today" && dueDate === today)
      || (dueDateFilter === "next7" && Boolean(dueDate && today && dueDate >= today && dueDate <= nextSevenDays))
      || (dueDateFilter === "none" && !dueDate);
    return matchesView && matchesQuery && matchesType && matchesReminders && matchesAssignee && matchesStatus && matchesPriority && matchesRelease && matchesPlatform && matchesDueDate;
  }).sort((a, b) => a.sortOrder - b.sortOrder), [assigneeFilter, currentUser?.id, dueDateFilter, filter, items, nextSevenDays, platformFilter, priorityFilter, query, releaseFilter, statusFilter, today, view]);

  const activeFilterCount = Number(Boolean(query)) + Number(filter !== "All types") + Number(assigneeFilter !== "all") + Number(statusFilter !== "all") + Number(priorityFilter !== "all") + Number(dueDateFilter !== "any") + Number(releaseFilter !== "all") + Number(platformFilter !== "all");
  const resetFilterField = (field: FilterField) => {
    if (field === "search") setQuery("");
    else if (field === "type") setFilter("All types");
    else if (field === "assignee") setAssigneeFilter("all");
    else if (field === "status") setStatusFilter("all");
    else if (field === "priority") setPriorityFilter("all");
    else if (field === "dueDate") setDueDateFilter("any");
    else if (field === "release") setReleaseFilter("all");
    else setPlatformFilter("all");
  };
  const toggleVisibleFilter = (field: FilterField, checked: boolean) => {
    setVisibleFilters((current) => checked
      ? [...current, field]
      : current.filter((entry) => entry !== field));
    if (!checked) resetFilterField(field);
  };
  const clearAllFilters = () => {
    setQuery("");
    filterFields.forEach(({ id }) => resetFilterField(id));
  };

  const globalSearchResults = useMemo(() => {
    const searchTerm = globalSearchQuery.trim().toLowerCase();
    const matchingItems = searchTerm
      ? items.filter((item) => {
        const releaseName = releases.find((release) => release.id === item.releaseId)?.name ?? "";
        const platformNames = item.platformIds.map((id) => platforms.find((platform) => platform.id === id)?.name ?? "").join(" ");
        const searchableText = [
          item.title,
          item.id,
          item.type,
          typeNames[item.type],
          statusNames[item.status],
          item.priority,
          item.assignee,
          item.body,
          item.testSteps,
          item.tags.join(" "),
          releaseName,
          platformNames,
        ].join(" ").toLowerCase();
        return searchableText.includes(searchTerm);
      })
      : items;
    return matchingItems.slice(0, 8);
  }, [globalSearchQuery, items, platforms, releases]);

  const openSearchResult = (item: Item) => {
    const targetPath = ["note", "meeting_note", "testing_note", "release_note"].includes(item.type)
      ? viewPaths.Notes
      : viewPaths["All Items"];
    openItemDetails(item);
    setGlobalSearchOpen(false);
    setGlobalSearchQuery("");
    router.push(`${targetPath}?item=${encodeURIComponent(item.dbId)}`);
  };

  const addItem = async () => {
    if (!title.trim()) return;
    const client = createClient();
    if (!client || !currentUser) { notify("Your Supabase session is not available"); return; }
    const assignee = profiles.find((profile) => profile.id === newAssignee);
    const { data, error } = await client.rpc("create_item_with_platforms", {
      item_title: title.trim(),
      item_type: newType,
      item_body: itemBody.trim(),
      item_test_steps: newType === "task" ? itemTestSteps.trim() : "",
      item_priority: newPriority,
      item_assignee_id: assignee?.id ?? null,
      item_release_id: newReleaseId || null,
      item_platform_ids: newPlatformIds,
      item_reminder_at: newReminder ? new Date(newReminder).toISOString() : null,
      item_reminder_repeat: newReminder ? newReminderRepeat : "none",
    });
    if (error) { notify(`Could not create item: ${error.message}`); return; }
    const item = mapDatabaseItem({ ...(data as Record<string, unknown>), item_platforms: newPlatformIds.map((platform_id) => ({ platform_id })) }, profiles);
    setItems((current) => [...current, item].sort((a, b) => a.sortOrder - b.sortOrder));
    setTitle(""); setItemBody(""); setItemTestSteps(""); setNewReleaseId(""); setNewPlatformIds([]); setNewReminder(""); setNewReminderRepeat("none"); setModal(false); notify(`${typeNames[newType]} created`);
  };

  const createRelease = async () => {
    if (!releaseName.trim() || currentUser?.role !== "admin") return;
    const client = createClient();
    if (!client) { notify("Your Supabase session is not available"); return; }
    setCreatingRelease(true);
    const { data: releaseId, error } = await client.rpc("create_release_with_platforms", {
      release_name: releaseName.trim(),
      release_target_date: releaseTargetDate || null,
      release_summary: releaseSummary.trim() || null,
      release_notes: releaseNotes.trim() || null,
      release_platform_ids: releasePlatformIds,
    });
    setCreatingRelease(false);
    if (error) { notify(`Could not create release: ${error.message}`); return; }
    const created: AppRelease = {
      id: releaseId as string,
      name: releaseName.trim(),
      target_date: releaseTargetDate || null,
      status: "planned",
      summary: releaseSummary.trim() || null,
      release_notes: releaseNotes.trim() || null,
      public_token: null,
      public_enabled: false,
      platformIds: [...releasePlatformIds],
    };
    setReleases((current) => [...current, created].sort((a, b) => (a.target_date ?? "9999-12-31").localeCompare(b.target_date ?? "9999-12-31")));
    setReleaseName(""); setReleaseTargetDate(""); setReleaseSummary(""); setReleaseNotes(""); setReleasePlatformIds([]); setReleaseModal(false);
    notify("Release created");
  };

  const openReleaseEditor = (release: AppRelease) => {
    if (release.status === "closed" || currentUser?.role !== "admin") return;
    setEditingReleaseId(release.id);
    setReleaseName(release.name);
    setReleaseTargetDate(release.target_date ?? "");
    setReleaseSummary(release.summary ?? "");
    setReleaseNotes(release.release_notes ?? "");
    setReleasePlatformIds(release.platformIds);
    setReleaseEditModal(true);
  };

  const saveReleaseDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingReleaseId || !releaseName.trim() || currentUser?.role !== "admin") return;
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    setSavingReleaseDetails(true);
    const { error } = await client.rpc("update_release_details", {
      release_uuid: editingReleaseId,
      release_name: releaseName.trim(),
      release_target_date: releaseTargetDate || null,
      release_summary: releaseSummary.trim() || null,
      release_notes: releaseNotes.trim() || null,
      release_platform_ids: releasePlatformIds,
    });
    setSavingReleaseDetails(false);
    if (error) { notify(`Could not save release details: ${error.message}`); return; }
    const updatedRelease = releases.find((release) => release.id === editingReleaseId);
    if (updatedRelease) {
      const updated = {
        ...updatedRelease,
        name: releaseName.trim(),
        target_date: releaseTargetDate || null,
        summary: releaseSummary.trim() || null,
        release_notes: releaseNotes.trim() || null,
        platformIds: releasePlatformIds,
      };
      setReleases((current) => current.map((release) => release.id === editingReleaseId ? updated : release)
        .sort((a, b) => (a.target_date ?? "9999-12-31").localeCompare(b.target_date ?? "9999-12-31")));
    }
    setReleaseEditModal(false);
    setEditingReleaseId(null);
    notify("Release details updated");
  };

  const toggleReleaseSharing = async (release: AppRelease) => {
    if (currentUser?.role !== "admin") return;
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    setReleaseActionId(release.id);
    const { data: token, error } = await client.rpc("set_release_public_share", {
      release_id: release.id,
      enable_share: !release.public_enabled,
    });
    setReleaseActionId(null);
    if (error) { notify(`Could not update release link: ${error.message}`); return; }
    const updated = { ...release, public_token: typeof token === "string" ? token : null, public_enabled: !release.public_enabled };
    setReleases((current) => current.map((entry) => entry.id === release.id ? updated : entry));
    if (updated.public_enabled && updated.public_token) {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/r/${updated.public_token}`);
        notify("Public release link created and copied");
      } catch {
        notify("Public release link created. Copy the link shown below.");
      }
    } else {
      notify("Public release link disabled");
    }
  };

  const copyReleaseLink = async (release: AppRelease) => {
    if (!release.public_token) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${release.public_token}`);
      notify("Public release link copied");
    } catch (error) {
      console.error("Could not copy public release link", error);
      notify("Could not copy the link. Select and copy it below.");
    }
  };

  const closeRelease = (release: AppRelease) => {
    if (currentUser?.role !== "admin" || release.status === "closed") return;
    setReleasePendingClose(release);
  };

  const confirmCloseRelease = async () => {
    const release = releasePendingClose;
    if (!release || currentUser?.role !== "admin" || release.status === "closed") return;
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    setReleaseActionId(release.id);
    const { error } = await client.from("releases").update({ status: "closed" }).eq("id", release.id);
    setReleaseActionId(null);
    if (error) { notify(`Could not close release: ${error.message}`); return; }
    setReleases((current) => current.map((entry) => entry.id === release.id ? { ...entry, status: "closed" } : entry));
    setReleasePendingClose(null);
    notify("Release closed");
  };

  const updateItemDetails = async (item: Item, databaseChanges: Record<string, unknown>, itemChanges: Partial<Item>, message: string) => {
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return false; }
    const { error } = await client.from("items").update(databaseChanges).eq("id", item.dbId);
    if (error) { notify(`Could not update item: ${error.message}`); return false; }
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? { ...candidate, ...itemChanges } : candidate));
    setSelected((current) => current?.dbId === item.dbId ? { ...current, ...itemChanges } : current);
    notify(message);
    return true;
  };

  const saveItemText = async (item: Item, field: "title" | "body" | "testSteps", value: string) => {
    const normalized = value.trim();
    if (field === "title" && !normalized) { notify("Task title cannot be empty"); return; }
    const databaseField = field === "testSteps" ? "test_steps" : field;
    const changes: Partial<Item> = field === "title" ? { title: normalized } : field === "body" ? { body: value } : { testSteps: value };
    const saved = await updateItemDetails(item, { [databaseField]: field === "title" ? normalized : value }, changes, `${field === "title" ? "Title" : field === "body" ? "Description" : "Test steps"} updated`);
    if (!saved) return;
    if (field === "title") setTitleDraft(null);
    else if (field === "body") setDescriptionDraft(null);
    else setTestStepsDraft(null);
  };

  const updateItemPlatforms = async (item: Item, platformIds: string[]) => {
    const client = createClient();
    if (!client) { notify("Supabase connection is unavailable"); return; }
    const { error } = await client.rpc("update_item_platforms", { item_uuid: item.dbId, item_platform_ids: platformIds });
    if (error) { notify(`Could not update platforms: ${error.message}`); return; }
    const updatedPlatforms = [...new Set(platformIds)];
    setItems((current) => current.map((candidate) => candidate.dbId === item.dbId ? { ...candidate, platformIds: updatedPlatforms } : candidate));
    setSelected((current) => current?.dbId === item.dbId ? { ...current, platformIds: updatedPlatforms } : current);
    notify("Platforms updated");
  };

  const addItemTag = async (item: Item, draft: string) => {
    const tag = draft.trim().replace(/,+$/, "").trim();
    if (!tag) { setTagDraft(null); return; }
    if (item.tags.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagDraft(null);
      return;
    }
    const tags = [...item.tags, tag];
    const saved = await updateItemDetails(item, { tags }, { tags }, "Tag added");
    if (saved) setTagDraft(null);
  };

  const removeItemTag = async (item: Item, tagToRemove: string) => {
    const tags = item.tags.filter((tag) => tag !== tagToRemove);
    await updateItemDetails(item, { tags }, { tags }, "Tag removed");
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
    const [teamCommentsResult, guestCommentsResult] = await Promise.all([
      client
        .from("item_comments")
        .select("id,item_id,author_id,body,created_at")
        .eq("item_id", item.dbId)
        .order("created_at", { ascending: true }),
      item.type === "task"
        ? client.rpc("public_item_comments_for_item", { item_uuid: item.dbId })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (requestId !== commentsRequestRef.current) return;
    setCommentsLoading(false);
    if (teamCommentsResult.error) console.error("Unable to load workspace comments", teamCommentsResult.error);
    if (guestCommentsResult.error) console.error("Unable to load guest comments", guestCommentsResult.error);
    const commentLoadError = teamCommentsResult.error ?? guestCommentsResult.error;
    if (commentLoadError) {
      const error = commentLoadError;
      notify(`Could not load all comments: ${error.message}`);
    }
    const teamComments: ItemComment[] = (teamCommentsResult.data ?? []).map((comment) => ({
      ...comment,
      authorName: profiles.find((profile) => profile.id === comment.author_id)?.display_name ?? "Team member",
      source: "team" as const,
    }));
    const guestCommentRows = (guestCommentsResult.data ?? []) as { id: string; item_id: string; author_name: string; body: string; created_at: string }[];
    const guestComments: ItemComment[] = guestCommentRows.map((comment) => ({
      ...comment,
      author_id: null,
      authorName: comment.author_name,
      source: "guest",
    }));
    setComments([...teamComments, ...guestComments].sort((a, b) => a.created_at.localeCompare(b.created_at)));
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
    setComments((existing) => [...existing, { ...data, authorName: currentUser.display_name, source: "team" as const }].sort((a, b) => a.created_at.localeCompare(b.created_at)));
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
  const activeRelease = releases.find((release) => ["planned", "ready", "deploying"].includes(release.status)) ?? null;
  const canEditSelected = Boolean(selected && currentUser && (
    currentUser.role === "admin" || selected.creatorId === currentUser.id || selected.assigneeId === currentUser.id
  ));

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
        <Link className="brand" href={viewPaths.Dashboard}><span className="brand-mark">d.</span><span>daytrack</span><span className="brand-beta">TEAM</span></Link>
        <div className="sidebar-scroll">
          <nav className="nav-list" aria-label="Main navigation">
            {navItems.map((item) => {
              const icon = item === "Dashboard" ? "grid" : item === "My Items" ? "inbox" : item === "All Items" ? "list" : item === "Notes" ? "note" : item === "Releases" ? "rocket" : item === "Reminders" ? "bell" : item === "Team" ? "users" : "settings";
              return <Link key={item} href={viewPaths[item]} onClick={() => setProfileMenuOpen(false)} className={`nav-link ${view === item ? "active" : ""}`} aria-current={view === item ? "page" : undefined}><Icon name={icon} /><span>{item}</span>{item === "Reminders" && items.some((entry) => entry.reminder) && <span className="nav-count">{items.filter((entry) => entry.reminder).length}</span>}</Link>;
            })}
          </nav>
        </div>
        {activeRelease && <div className="release-mini"><div className="mini-release-top"><span className="eyebrow">ACTIVE RELEASE</span><span className="release-dot" /></div><strong>{activeRelease.name}</strong><div className="release-mini-sub">{activeRelease.target_date ? `Target ${formatDueDate(activeRelease.target_date, today)}` : activeRelease.status}</div><button onClick={() => setView("Releases")} className="text-link">View release <Icon name="arrow" size={13} /></button></div>}
      </aside>

      <section className="main-pane">
        <header className="topbar">
          <button className="topbar-search" aria-label="Search workspace" title="Search workspace" onClick={() => setGlobalSearchOpen(true)}><Icon name="search" size={15} /><span>Search tasks, notes, releases...</span><kbd>⌘ F</kbd></button>
          <div className="top-actions">
            <span className="today-date">{headerDate}</span>
            <span className="top-divider" />
            <button className="icon-button top-reminders-button" aria-label={`Reminders${items.some((item) => item.reminder) ? ` (${items.filter((item) => item.reminder).length})` : ""}`} title="Reminders" onClick={() => setView("Reminders")}><Icon name="bell" />{items.some((item) => item.reminder) && <span className="top-reminder-count">{items.filter((item) => item.reminder).length}</span>}</button>
            <div className="profile-menu-wrap topbar-profile-wrap" ref={profileMenuRef}>
              {profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu"><div className="profile-menu-heading"><span className="avatar avatar-purple">{initials(currentUser.display_name)}</span><span><b>{currentUser.display_name}</b><small>{currentUser.role} account</small></span></div><button className="profile-menu-settings" role="menuitem" onClick={() => { setView("Profile"); setProfileMenuOpen(false); }}><Icon name="users" size={14} /> Profile settings</button><button className="profile-menu-logout" role="menuitem" onClick={() => void signOut()} disabled={signingOut}><Icon name="logout" size={14} />{signingOut ? "Signing out..." : "Log out"}</button></div>}
              <button className="topbar-profile-button" aria-label="Open account menu" aria-expanded={profileMenuOpen} aria-haspopup="menu" onClick={() => setProfileMenuOpen((open) => !open)}><span className="avatar avatar-small avatar-purple">{initials(currentUser.display_name)}</span></button>
            </div>
          </div>
        </header>

        <div className="content">
          {view === "Dashboard" ? (
            <>
              <div className="page-heading"><div><div className="eyebrow">{todayLabel}</div><h1>Good morning, {currentUser.display_name.split(" ")[0]} <span className="wave">✳</span></h1><p className="page-subtitle">A clear view of what needs your attention today.</p></div><button className="primary-button" onClick={() => openItemModal()}><Icon name="plus" size={15} /> Add task <kbd>N</kbd></button></div>
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
                    {myOpenItems.filter((item) => item.dueDate === today).slice(0, 3).map((item) => <FocusRow key={item.id} item={item} onClick={() => openItemDetails(item)} onComplete={() => toggleComplete(item)} />)}
                    {dueToday === 0 && <div className="empty-inline">Nothing due today. Add an item when something needs your attention.</div>}
                  </div>
                  <button className="add-inline" onClick={() => openItemModal()}><Icon name="plus" size={14} /> Add a task</button>
                </section>
                <section className="panel reminders-panel">
                  <div className="panel-heading"><div><h2>Coming up</h2><span className="panel-caption">Your next reminders</span></div><button className="quiet-icon" aria-label="Reminder options"><Icon name="more" /></button></div>
                  {upcomingReminders.length ? upcomingReminders.map((item) => <button className="reminder-entry reminder-entry-button" key={item.dbId} onClick={() => openItemDetails(item)}><span className="reminder-time">{new Date(item.reminder!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className="reminder-line" /><span><b>{item.title}</b><small>{formatDueDate(item.reminder!.slice(0, 10))}</small></span><span className="reminder-dot" /></button>) : <div className="empty-inline">No upcoming reminders.</div>}
                  <button className="add-inline" onClick={() => setView("Reminders")}><Icon name="bell" size={14} /> All reminders <span className="inline-count">{items.filter((item) => item.reminder).length}</span></button>
                </section>
                <section className="panel items-panel">
                  <div className="panel-heading"><div><h2>Team activity</h2><span className="panel-caption">Latest updates across your workspace</span></div><button className="subtle-button" onClick={() => setView("All Items")}>All items <Icon name="arrow" size={13} /></button></div>
                  <div className="table-wrap"><table className="items-table"><thead><tr><th className="drag-handle-header" aria-label="Reorder" /><th>ITEM</th><th>STATUS</th><th>ASSIGNEE</th><th>PRIORITY</th><th>DUE</th></tr></thead><tbody>{items.slice(0, 4).map((item) => <ItemRow key={item.dbId} item={item} onClick={() => openItemDetails(item)} draggable={!reorderingItems} dragOver={dragOverItemId === item.dbId} onDragStart={setDraggedItemId} onDragOver={setDragOverItemId} onDrop={reorderItems} />)}</tbody></table>{items.length === 0 && <div className="empty-inline">Your workspace is empty. Create the first item.</div>}</div>
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
              <div className="page-heading list-heading"><div><h1>{view}</h1><p className="page-subtitle">{view === "My Items" ? "Everything assigned to you, in one place." : view === "Releases" ? "Plan deployments and keep every platform in sync." : view === "Reminders" ? "Stay on top of what needs attention." : view === "Notes" ? "Meeting notes, testing notes, and quick thoughts." : view === "Profile" ? "Manage your account details and password." : "Track the work moving your team forward."}</p></div>{view === "Releases" && currentUser.role === "admin" ? <button className="primary-button" onClick={() => setReleaseModal(true)}><Icon name="plus" size={15} /> New release</button> : ["Profile", "Team", "Settings"].includes(view) ? null : <button className="primary-button" onClick={() => openItemModal(null, view === "Notes" ? "note" : "task")}><Icon name="plus" size={15} /> {view === "Notes" ? "Add note" : view === "Reminders" ? "Add reminder" : view === "Releases" || view === "All Items" ? "Add item" : "Add task"} <kbd>N</kbd></button>}</div>
              {view === "Releases" ? releases.length > 0 ? <div className="release-list">{releases.map((release) => <ReleaseView key={release.id} release={release} items={items.filter((item) => item.releaseId === release.id)} platforms={platforms} canManage={currentUser.role === "admin"} actionPending={releaseActionId === release.id} onAddItem={() => openItemModal(release.id)} onSelectItem={openItemDetails} onEditDetails={() => openReleaseEditor(release)} onToggleShare={() => void toggleReleaseSharing(release)} onCopyShare={() => void copyReleaseLink(release)} onClose={() => void closeRelease(release)} />)}</div> : <EmptyWorkspace message="No releases yet. An admin can create the first release." /> : view === "Profile" || view === "Team" || view === "Settings" ? <div className="panel simple-panel">
                <div className="team-heading"><div><h2>{view === "Team" ? "Your team" : view === "Profile" ? "Your profile" : "Workspace platforms"}</h2><p className="panel-caption">{view === "Team" ? "Workspace members and access roles." : view === "Profile" ? "Update your account name and password." : "Manage the platforms available for release planning."}</p></div>{view === "Team" && currentUser.role === "admin" && <button className="primary-button" onClick={() => setInviteOpen(true)}><Icon name="plus" size={14} /> Invite teammate</button>}{view === "Settings" && currentUser.role === "admin" && <button className="primary-button" onClick={() => setPlatformModalOpen(true)}><Icon name="plus" size={14} /> Add platform</button>}</div>
                {view === "Profile" ? <ProfileSettings user={currentUser} name={profileName} onNameChange={setProfileName} onSaveName={saveProfileName} profileSaving={profileSaving} password={passwordDraft} onPasswordChange={setPasswordDraft} confirmation={passwordConfirmation} onConfirmationChange={setPasswordConfirmation} onSavePassword={savePassword} passwordSaving={passwordSaving} /> : view === "Team" ? profiles.map((profile) => <div className="team-row" key={profile.id}><span className="avatar avatar-purple">{initials(profile.display_name)}</span><b>{profile.display_name}</b><Label tone={profile.role === "admin" ? "green" : "neutral"}>{profile.role}</Label><span className="team-email">{profile.email ?? ""}</span></div>) : null}
                {view === "Settings" && <>
                  {currentUser.role !== "admin" && <p className="panel-caption platform-readonly-note">Only workspace admins can add or change platforms.</p>}
                  <div className="platform-settings-list">{platforms.map((platform) => <div className="platform-settings-row" key={platform.id}>
                    <div className="platform-settings-copy"><b>{platform.name}</b>{platform.description && <span>{platform.description}</span>}</div>
                    {currentUser.role === "admin" && <button className="secondary-button" type="button" disabled={platformSavingId === platform.id} onClick={() => void togglePlatform(platform)}>{platformSavingId === platform.id ? "Saving..." : platform.is_active ? "Deactivate" : "Activate"}</button>}
                  </div>)}
                  {platforms.length === 0 && <EmptyWorkspace message="No platforms yet. Add one to start organizing release targets." />}
                  </div>
                </>}
                {view === "Team" && profiles.length === 0 && <EmptyWorkspace message="No active team members were found." />}
              </div> : <>
                <div className="toolbar list-toolbar">
                  <div className="list-filters" aria-label="List filters">
                  {visibleFilters.includes("search") && <div className="filter-search-control"><div className="search-field"><Icon name="search" size={14} /><input id="item-search" aria-label="Search items" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items..." /><kbd>⌘ F</kbd></div></div>}
                  {visibleFilters.includes("type") && <select className="filter-select filter-control" aria-label="Filter by type" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All types</option>{Object.values(typeNames).map((name) => <option key={name}>{name}</option>)}</select>}
                  {visibleFilters.includes("assignee") && <select className="filter-select filter-control" aria-label="Filter by assignee" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="all">All assignees</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select>}
                  {visibleFilters.includes("status") && <select className="filter-select filter-control" aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusNames).map(([status, name]) => <option key={status} value={status}>{name}</option>)}</select>}
                  {visibleFilters.includes("priority") && <select className="filter-select filter-control" aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{(["urgent", "high", "medium", "low"] as Priority[]).map((priority) => <option key={priority} value={priority}>{priority[0].toUpperCase() + priority.slice(1)}</option>)}</select>}
                  {visibleFilters.includes("dueDate") && <select className="filter-select filter-control" aria-label="Filter by due date" value={dueDateFilter} onChange={(event) => setDueDateFilter(event.target.value)}><option value="any">Any due date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="next7">Next 7 days</option><option value="none">No due date</option></select>}
                  {visibleFilters.includes("release") && <select className="filter-select filter-control" aria-label="Filter by release" value={releaseFilter} onChange={(event) => setReleaseFilter(event.target.value)}><option value="all">All releases</option><option value="none">No release</option>{releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select>}
                  {visibleFilters.includes("platform") && <select className="filter-select filter-control" aria-label="Filter by platform" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option><option value="none">No platform</option>{platforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</select>}
                  </div>
                  {activeFilterCount > 0 && <button className="clear-filters" type="button" onClick={clearAllFilters}>Clear filters</button>}
                  <div className="filter-menu-wrap" ref={filterMenuRef}>
                    <button className={`filter-menu-trigger${filterMenuOpen ? " is-open" : ""}`} type="button" aria-label="Choose visible filters" aria-expanded={filterMenuOpen} aria-haspopup="dialog" title="Choose visible filters" onClick={() => setFilterMenuOpen((open) => !open)}><Icon name="filter" size={16} />{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}</button>
                    {filterMenuOpen && <div className="filter-picker" role="dialog" aria-label="Choose visible filters">
                      <div className="filter-picker-heading"><b>Visible filters</b><span>Choose fields for this list</span></div>
                      <div className="filter-picker-options">{filterFields.map(({ id, label }) => <label key={id} className="filter-picker-option"><input type="checkbox" checked={visibleFilters.includes(id)} onChange={(event) => toggleVisibleFilter(id, event.target.checked)} /><span>{label}</span></label>)}</div>
                      <div className="filter-picker-footer"><button type="button" onClick={() => setVisibleFilters(filterFields.map(({ id }) => id))}>Show all</button><button type="button" onClick={() => { visibleFilters.forEach(resetFilterField); setVisibleFilters([]); }}>Clear shown</button></div>
                    </div>}
                  </div>
                </div>
                {view === "Reminders" ? <ReminderList items={filteredItems} onSnooze={snoozeReminder} onDismiss={dismissReminder} onReorder={reorderItems} onDragStart={setDraggedItemId} onDragOver={setDragOverItemId} dragOverItemId={dragOverItemId} draggable={!reorderingItems} /> : <div className="panel list-panel"><div className="table-wrap"><table className="items-table full-table"><thead><tr><th className="drag-handle-header" aria-label="Reorder" /><th>ITEM</th><th>TYPE</th><th>STATUS</th><th>ASSIGNEE</th><th>PRIORITY</th><th>DUE DATE</th></tr></thead><tbody>{filteredItems.map((item) => <ItemRow key={item.id} item={item} onClick={() => openItemDetails(item)} extended draggable={!reorderingItems} dragOver={dragOverItemId === item.dbId} onDragStart={setDraggedItemId} onDragOver={setDragOverItemId} onDrop={reorderItems} />)}</tbody></table>{filteredItems.length === 0 && <div className="empty-state"><span className="empty-icon"><Icon name="inbox" size={20} /></span><b>No items found</b><p>Try a different search or create a new {view === "Notes" ? "note" : "item"}.</p><button className="secondary-button" onClick={() => openItemModal(null, view === "Notes" ? "note" : "task")}><Icon name="plus" size={14} /> {view === "Notes" ? "Create a note" : "Create an item"}</button></div>}</div></div>}
              </>}
            </section>
          )}
        </div>
        <div className="quickbar"><button className="quickbar-plus" onClick={() => setModal(true)}><Icon name="plus" size={17} /></button><button className="quickbar-prompt" onClick={() => setModal(true)}>Quick capture <span>Task, issue, note, anything...</span></button><button className="quickbar-shortcut" onClick={() => setModal(true)}><Icon name="command" size={12} /><span>K</span></button></div>
      </section>

      {notificationState === "ask" && <div className="permission-prompt"><span className="permission-icon"><Icon name="bell" /></span><div><b>Never miss a reminder</b><small>Allow browser notifications to get a nudge when things are due.</small></div><button onClick={askPermission}>Enable</button><button className="prompt-close" onClick={() => setNotificationState("denied")} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>}
      {notificationState === "denied" && <div className="permission-prompt muted-prompt"><span className="permission-icon"><Icon name="bell" /></span><div><b>Notifications are off</b><small>You can enable them in your browser settings.</small></div><button className="prompt-close" onClick={() => setNotificationState("unsupported")} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>}
      {notificationState === "unsupported" && <div className="permission-prompt muted-prompt"><span className="permission-icon"><Icon name="bell" /></span><div><b>Browser notifications unavailable</b><small>Reminders remain visible in DayTrack.</small></div><button className="prompt-close" onClick={() => setNotificationState("enabled")} aria-label="Dismiss"><Icon name="close" size={14} /></button></div>}

      {currentUser.role === "admin" && demoLoaded === false && demoPromptOpen && <div className="modal-backdrop"><section className="quick-modal demo-modal" role="dialog" aria-modal="true" aria-labelledby="demo-title"><div className="modal-header"><div><div className="eyebrow">FIRST-TIME WORKSPACE SETUP</div><h2 id="demo-title">Load sample workspace data?</h2></div></div><p className="demo-copy">Add example items and a release plan to explore DayTrack. This is optional and can be done only once for this workspace. Existing workspace data will be kept.</p><div className="demo-includes"><span>5 sample items</span><span>1 release</span><span>Checklists and release notes</span></div><div className="modal-footer"><button className="secondary-button" onClick={() => void dismissDemoPrompt()} disabled={dismissingDemoPrompt || loadingDemo}>{dismissingDemoPrompt ? "Saving..." : "Not now"}</button><button className="primary-button" onClick={() => void loadDemoData()} disabled={loadingDemo || dismissingDemoPrompt}>{loadingDemo ? "Loading sample data..." : "Load demo data"}</button></div></section></div>}

      {inviteOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setInviteOpen(false); }}><form className="quick-modal" onSubmit={(event) => { event.preventDefault(); void inviteMember(); }} aria-labelledby="invite-title"><div className="modal-header"><div><div className="eyebrow">TEAM ACCESS</div><h2 id="invite-title">Invite a teammate</h2></div><button className="quiet-icon" type="button" onClick={() => setInviteOpen(false)} aria-label="Close"><Icon name="close" /></button></div><p className="invite-description">We&apos;ll send an email invitation so they can securely join your workspace.</p><label className="form-label" htmlFor="invite-name">Name<input id="invite-name" className="title-input" autoFocus required maxLength={100} value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Teammate name" /></label><label className="form-label invite-field" htmlFor="invite-email">Email address<input id="invite-email" type="email" required className="title-input" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" /></label><label className="form-label invite-field" htmlFor="invite-role">Role<select id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "user" | "admin")}><option value="user">User</option><option value="admin">Admin</option></select></label><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary-button" type="submit" disabled={inviting}>{inviting ? "Sending invite..." : "Send invitation"}</button></div></form></div>}

      {platformModalOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !addingPlatform) setPlatformModalOpen(false); }}><form className="quick-modal" onSubmit={(event) => void addPlatform(event)} aria-labelledby="platform-create-title"><div className="modal-header"><div><div className="eyebrow">WORKSPACE SETTINGS</div><h2 id="platform-create-title">Add a platform</h2></div><button className="quiet-icon" type="button" onClick={() => setPlatformModalOpen(false)} aria-label="Close" disabled={addingPlatform}><Icon name="close" /></button></div><label className="form-label" htmlFor="platform-name">Platform name<input id="platform-name" autoFocus className="title-input" required maxLength={80} value={platformName} onChange={(event) => setPlatformName(event.target.value)} placeholder="e.g. Mobile app" /></label><label className="form-label invite-field" htmlFor="platform-description">Description <span className="optional-label">Optional</span><input id="platform-description" className="title-input" maxLength={240} value={platformDescription} onChange={(event) => setPlatformDescription(event.target.value)} placeholder="Short description" /></label><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setPlatformModalOpen(false)} disabled={addingPlatform}>Cancel</button><button className="primary-button" type="submit" disabled={addingPlatform || !platformName.trim()}>{addingPlatform ? "Adding..." : <><Icon name="plus" size={14} /> Add platform</>}</button></div></form></div>}

      {releaseModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !creatingRelease) setReleaseModal(false); }}><form className="quick-modal release-create-modal release-details-modal" onSubmit={(event) => { event.preventDefault(); void createRelease(); }} aria-labelledby="release-create-title"><div className="modal-header"><div><div className="eyebrow">RELEASE PLANNING</div><h2 id="release-create-title">Create a release</h2></div><button className="quiet-icon" type="button" onClick={() => setReleaseModal(false)} aria-label="Close" disabled={creatingRelease}><Icon name="close" /></button></div><div className="release-name-date-row"><label className="form-label" htmlFor="release-name">Release name<input id="release-name" autoFocus required maxLength={120} className="title-input" placeholder="e.g. v3.1.0" value={releaseName} onChange={(event) => setReleaseName(event.target.value)} /></label><label className="form-label" htmlFor="release-target-date">Target date<input id="release-target-date" type="date" value={releaseTargetDate} onChange={(event) => setReleaseTargetDate(event.target.value)} /></label></div><div className="form-label release-platform-field">Platforms<PlatformMultiSelect id="release-create-platforms" platforms={platforms.filter((platform) => platform.is_active)} selectedIds={releasePlatformIds} disabled={!platforms.some((platform) => platform.is_active)} onChange={setReleasePlatformIds} />{!platforms.some((platform) => platform.is_active) && <small className="multi-select-hint">No active platforms available</small>}</div><label className="form-label release-notes-field" htmlFor="release-summary">Summary<textarea id="release-summary" rows={3} maxLength={5000} value={releaseSummary} onChange={(event) => setReleaseSummary(event.target.value)} placeholder="Add a short summary of this release." /></label><label className="form-label release-notes-field" htmlFor="release-notes">Release notes<textarea id="release-notes" rows={5} maxLength={10000} value={releaseNotes} onChange={(event) => setReleaseNotes(event.target.value)} placeholder="List the changes included in this release." /></label><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setReleaseModal(false)} disabled={creatingRelease}>Cancel</button><button className="primary-button" type="submit" disabled={creatingRelease || !releaseName.trim()}>{creatingRelease ? "Creating..." : <><Icon name="plus" size={14} /> Create release</>}</button></div></form></div>}
      {releasePendingClose && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && releaseActionId !== releasePendingClose.id) setReleasePendingClose(null); }}><section className="quick-modal release-close-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="release-close-title" aria-describedby="release-close-description"><div className="modal-header"><div><div className="eyebrow">CLOSE RELEASE</div><h2 id="release-close-title">Close {releasePendingClose.name}?</h2></div><button className="quiet-icon" type="button" onClick={() => setReleasePendingClose(null)} aria-label="Cancel closing release" disabled={releaseActionId === releasePendingClose.id}><Icon name="close" /></button></div><p id="release-close-description">This release will no longer accept new items or changes to its details and release content. Existing items and its public report will remain available.</p><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => setReleasePendingClose(null)} disabled={releaseActionId === releasePendingClose.id}>Cancel</button><button className="primary-button release-close-button" type="button" onClick={() => void confirmCloseRelease()} disabled={releaseActionId === releasePendingClose.id}>{releaseActionId === releasePendingClose.id ? "Closing..." : "Close release"}</button></div></section></div>}
      {releaseEditModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingReleaseDetails) { setReleaseEditModal(false); setEditingReleaseId(null); } }}><form className="quick-modal release-create-modal release-details-modal" onSubmit={(event) => void saveReleaseDetails(event)} aria-labelledby="release-edit-title"><div className="modal-header"><div><div className="eyebrow">RELEASE PLANNING</div><h2 id="release-edit-title">Edit release details</h2></div><button className="quiet-icon" type="button" onClick={() => { setReleaseEditModal(false); setEditingReleaseId(null); }} aria-label="Close" disabled={savingReleaseDetails}><Icon name="close" /></button></div><div className="release-name-date-row"><label className="form-label" htmlFor="release-edit-name">Release name<input id="release-edit-name" autoFocus required maxLength={120} className="title-input" value={releaseName} onChange={(event) => setReleaseName(event.target.value)} /></label><label className="form-label" htmlFor="release-edit-date">Target date<input id="release-edit-date" type="date" value={releaseTargetDate} onChange={(event) => setReleaseTargetDate(event.target.value)} /></label></div><div className="form-label release-platform-field">Platforms<PlatformMultiSelect id="release-edit-platforms" platforms={platforms.filter((platform) => platform.is_active || releasePlatformIds.includes(platform.id))} selectedIds={releasePlatformIds} disabled={!platforms.some((platform) => platform.is_active)} onChange={setReleasePlatformIds} />{!platforms.some((platform) => platform.is_active) && <small className="multi-select-hint">No active platforms available</small>}</div><label className="form-label release-notes-field" htmlFor="release-edit-summary">Summary<textarea id="release-edit-summary" rows={3} maxLength={5000} value={releaseSummary} onChange={(event) => setReleaseSummary(event.target.value)} placeholder="Add a short release summary." /></label><label className="form-label release-notes-field" htmlFor="release-edit-notes">Release notes<textarea id="release-edit-notes" rows={5} maxLength={10000} value={releaseNotes} onChange={(event) => setReleaseNotes(event.target.value)} placeholder="List the changes included in this release." /></label><div className="modal-footer"><button className="secondary-button" type="button" onClick={() => { setReleaseEditModal(false); setEditingReleaseId(null); }} disabled={savingReleaseDetails}>Cancel</button><button className="primary-button" type="submit" disabled={savingReleaseDetails || !releaseName.trim()}>{savingReleaseDetails ? "Saving..." : "Save release"}</button></div></form></div>}
      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
        <section className="quick-modal item-create-modal" role="dialog" aria-modal="true" aria-labelledby="quick-title">
          <div className="modal-header"><div><div className="eyebrow">QUICK CAPTURE</div><h2 id="quick-title">New {typeNames[newType].toLowerCase()}</h2></div><button className="quiet-icon" onClick={() => setModal(false)} aria-label="Close"><Icon name="close" /></button></div>
          <div className="item-title-type-row">
            <label className="form-label item-title-field" htmlFor="item-title">Title<input id="item-title" autoFocus className="title-input" placeholder="Give it a short, clear title..." value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }} /></label>
            <label className="form-label item-type-field">Type<select value={newType} onChange={(event) => setNewType(event.target.value as ItemType)}>{Object.entries(typeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          </div>
          <div className="form-grid">
            <label className="form-label">Priority<select value={newPriority} onChange={(event) => setNewPriority(event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label className="form-label">Assignee<select value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)}><option value="">Unassigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></label>
            <label className="form-label" htmlFor="item-release">Attach to release<select id="item-release" value={newReleaseId} onChange={(event) => setNewReleaseId(event.target.value)}><option value="">No release</option>{releases.filter((release) => release.status !== "closed").map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}</select></label>
            <div className="form-label">Platforms<PlatformMultiSelect id="item-platform" platforms={platforms.filter((platform) => platform.is_active)} selectedIds={newPlatformIds} disabled={!platforms.some((platform) => platform.is_active)} onChange={setNewPlatformIds} />{!platforms.some((platform) => platform.is_active) && <small className="multi-select-hint">No active platforms available</small>}</div>
            <label className="form-label">Reminder<input type="datetime-local" value={newReminder} onChange={(event) => setNewReminder(event.target.value)} /></label>
            <label className="form-label">Repeat<select value={newReminderRepeat} onChange={(event) => setNewReminderRepeat(event.target.value as "none" | "daily" | "weekly")}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          </div>
          <div className="item-textarea-grid">
            <label className="form-label item-note-field" htmlFor="item-body">Description<textarea id="item-body" rows={4} maxLength={5000} value={itemBody} onChange={(event) => setItemBody(event.target.value)} placeholder="Add context, decisions, or details..." /></label>
            {newType === "task" && <label className="form-label item-test-steps-field" htmlFor="item-test-steps">Test steps for QA<textarea id="item-test-steps" rows={4} maxLength={5000} value={itemTestSteps} onChange={(event) => setItemTestSteps(event.target.value)} placeholder="Add the steps QA should follow, one per line..." /></label>}
          </div>
          <div className="modal-footer"><span className="shortcut-hint">Press <kbd>Enter</kbd> to create</span><button className="secondary-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" onClick={() => void addItem()} disabled={!title.trim()}><Icon name="plus" size={14} /> Create {typeNames[newType].toLowerCase()}</button></div>
        </section>
      </div>}
      {globalSearchOpen && <div className="global-search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setGlobalSearchOpen(false); }}>
        <section className="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
          <div className="global-search-heading"><h2 id="global-search-title">Search workspace</h2><button className="quiet-icon" onClick={() => setGlobalSearchOpen(false)} aria-label="Close search"><Icon name="close" /></button></div>
          <label className="global-search-input"><Icon name="search" size={17} /><span className="sr-only">Search tasks and notes</span><input autoFocus value={globalSearchQuery} onChange={(event) => setGlobalSearchQuery(event.target.value)} placeholder="Search tasks, notes, releases, and more..." /></label>
          <div className="global-search-results" aria-live="polite">
            <div className="global-search-caption">{globalSearchQuery.trim() ? "MATCHING ITEMS" : "RECENT ITEMS"}</div>
            {globalSearchResults.length > 0 ? globalSearchResults.map((item) => {
              const releaseName = releases.find((release) => release.id === item.releaseId)?.name;
              return <button className="global-search-result" key={item.dbId} onClick={() => openSearchResult(item)}>
                <span className={`type-mark ${item.type}`}>{item.type === "issue" ? "!" : item.type === "task" ? "✓" : "≡"}</span>
                <span className="global-search-result-copy"><b>{item.title}</b><small>{item.id} · {typeNames[item.type]}{releaseName ? ` · ${releaseName}` : ""}</small></span>
                <Label tone={item.status === "done" ? "green" : item.status === "blocked" ? "red" : item.status === "in_progress" ? "blue" : "neutral"}>{statusNames[item.status]}</Label>
              </button>;
            }) : <p className="global-search-empty">No tasks or notes match “{globalSearchQuery.trim()}”.</p>}
          </div>
          <div className="global-search-footer"><span>Searches titles, descriptions, QA steps, tags, and releases</span><kbd>Esc</kbd></div>
        </section>
      </div>}

      {selected && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSelected(); }}>
        <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="Item details">
          <div className="drawer-top"><span className="item-id">{selected.id}</span><div className="drawer-actions">{selected.type === "task" && canEditSelected && <button className={`quiet-icon${selected.publicEnabled ? " task-share-active" : ""}`} aria-label={selected.publicEnabled ? "Copy public task link" : "Create public task link"} title={selected.publicEnabled ? "Copy public task link" : "Create public task link"} onClick={() => void shareTask(selected)} disabled={sharingTask}><Icon name="share" /></button>}<button className="quiet-icon" aria-label="Close item" onClick={closeSelected}><Icon name="close" /></button></div></div>
          <div className="drawer-title-row"><span className={`type-mark ${selected.type}`}>{selected.type === "issue" ? "!" : selected.type === "task" ? "✓" : "≡"}</span>{titleDraft?.itemId === selected.dbId ? <form className="drawer-title-edit" onSubmit={(event) => { event.preventDefault(); void saveItemText(selected, "title", titleDraft.value); }}><input aria-label="Task title" maxLength={200} value={titleDraft.value} onChange={(event) => setTitleDraft({ itemId: selected.dbId, value: event.target.value })} /><div className="drawer-edit-actions"><button type="button" className="secondary-button" onClick={() => setTitleDraft(null)}>Cancel</button><button type="submit" className="primary-button">Save title</button></div></form> : <><h2>{selected.title}</h2>{canEditSelected && <button className="drawer-edit-button" type="button" onClick={() => setTitleDraft({ itemId: selected.dbId, value: selected.title })}>Edit</button>}</>}</div>
          <div className="drawer-properties">
            <div><label htmlFor="item-type">Type</label><select id="item-type" disabled={!canEditSelected} value={selected.type} onChange={(event) => { const type = event.target.value as ItemType; void updateItemDetails(selected, { type }, { type }, "Type updated"); }}>{Object.entries(typeNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>
            <div><span>Status</span><select disabled={!canEditSelected} value={selected.status} onChange={(event) => void updateStatus(selected, event.target.value as Status)}>{Object.entries(statusNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></div>
            <div><label htmlFor="item-priority">Priority</label><select id="item-priority" disabled={!canEditSelected} className={`priority-select priority-${selected.priority}`} value={selected.priority} onChange={(event) => void updatePriority(selected, event.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
            <div><span>Assignee</span><select disabled={!canEditSelected} value={selected.assigneeId ?? ""} onChange={(event) => void updateAssignee(selected, event.target.value)}><option value="">Unassigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></div>
            <div><label htmlFor="item-due-date">Due date</label><input disabled={!canEditSelected} id="item-due-date" className="drawer-date-input" type="date" value={selected.dueDate ?? ""} onChange={(event) => void updateDueDate(selected, event.target.value)} /></div>
            <div><label htmlFor="item-release">Release</label><select id="item-release" disabled={!canEditSelected} value={selected.releaseId ?? ""} onChange={(event) => { const releaseId = event.target.value || null; void updateItemDetails(selected, { release_id: releaseId }, { releaseId }, "Release updated"); }}><option value="">No release</option>{releases.filter((release) => release.status !== "closed" || release.id === selected.releaseId).map((release) => <option key={release.id} value={release.id} disabled={release.status === "closed"}>{release.name}{release.status === "closed" ? " (closed)" : ""}</option>)}</select></div>
            <div className="drawer-platforms"><span>Platforms</span><PlatformMultiSelect id="item-detail-platform" platforms={platforms.filter((platform) => platform.is_active || selected.platformIds.includes(platform.id))} selectedIds={selected.platformIds} disabled={!canEditSelected} onChange={(platformIds) => void updateItemPlatforms(selected, platformIds)} /></div>
            <div><label htmlFor="item-reminder">Reminder</label><input disabled={!canEditSelected} id="item-reminder" className="drawer-date-input" type="datetime-local" value={dateTimeLocalValue(selected.reminder)} onChange={(event) => { const reminder = event.target.value ? new Date(event.target.value).toISOString() : null; void updateItemDetails(selected, { reminder_at: reminder, reminder_dismissed_at: null, reminder_notified_at: null }, { ...(reminder ? { reminder } : { reminder: undefined }) }, "Reminder updated"); }} /></div>
            <div><label htmlFor="item-reminder-repeat">Repeat</label><select id="item-reminder-repeat" disabled={!canEditSelected} value={selected.reminderRepeat ?? "none"} onChange={(event) => { const reminderRepeat = event.target.value as NonNullable<Item["reminderRepeat"]>; void updateItemDetails(selected, { reminder_repeat: reminderRepeat }, { reminderRepeat }, "Reminder repeat updated"); }}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div>
            <div className="drawer-tags">
              <span>Tags</span>
              <div className="drawer-tag-editor">
                {selected.tags.map((tag) => <span className="drawer-tag-chip" key={tag}>{tag}{canEditSelected && <button type="button" aria-label={`Remove ${tag} tag`} title={`Remove ${tag}`} onClick={() => void removeItemTag(selected, tag)}><Icon name="close" size={11} /></button>}</span>)}
                {canEditSelected && <input id="item-tags" aria-label="Add tag" value={tagDraft?.itemId === selected.dbId ? tagDraft.value : ""} onChange={(event) => setTagDraft({ itemId: selected.dbId, value: event.target.value })} onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    void addItemTag(selected, tagDraft?.itemId === selected.dbId ? tagDraft.value : "");
                  } else if (event.key === "Backspace" && !event.currentTarget.value && selected.tags.length > 0) {
                    void removeItemTag(selected, selected.tags[selected.tags.length - 1]);
                  }
                }} placeholder={selected.tags.length ? "Add another tag..." : "Type a tag and press Enter"} />}
              </div>
            </div>
            <div className="drawer-created"><span>Created</span><b>{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : "—"}</b></div>
          </div>
          {selected.type === "task" && (currentUser.role === "admin" || selected.creatorId === currentUser.id || selected.assigneeId === currentUser.id) && <div className="task-share-panel"><div><b>Public task page</b><span>Anyone with the link can view this task and leave a guest comment.</span></div><div className="task-share-actions">{selected.publicEnabled && selected.shareToken && <button className="secondary-button" onClick={() => void shareTask(selected)}>Copy link</button>}<button className="secondary-button" onClick={() => void toggleTaskSharing(selected)} disabled={sharingTask}>{sharingTask ? "Saving..." : selected.publicEnabled ? "Disable link" : "Create public link"}</button></div>{selected.publicEnabled && selected.shareToken && <input aria-label="Public task link" readOnly value={`${window.location.origin}/t/${selected.shareToken}`} onFocus={(event) => event.currentTarget.select()} />}</div>}
          <div className="drawer-section"><div className="section-title">Description{canEditSelected && descriptionDraft?.itemId !== selected.dbId && <button className="drawer-edit-button" type="button" onClick={() => setDescriptionDraft({ itemId: selected.dbId, value: selected.body })}>Edit</button>}</div>{descriptionDraft?.itemId === selected.dbId ? <form className="drawer-text-edit" onSubmit={(event) => { event.preventDefault(); void saveItemText(selected, "body", descriptionDraft.value); }}><textarea aria-label="Edit description" maxLength={5000} rows={5} value={descriptionDraft.value} onChange={(event) => setDescriptionDraft({ itemId: selected.dbId, value: event.target.value })} placeholder="Add context, decisions, or details..." /><div className="drawer-edit-actions"><button type="button" className="secondary-button" onClick={() => setDescriptionDraft(null)}>Cancel</button><button type="submit" className="primary-button">Save description</button></div></form> : <p className="description-text">{selected.body || "No description provided."}</p>}</div>
          {selected.type === "task" && <div className="drawer-section"><div className="section-title">Test steps for QA{canEditSelected && testStepsDraft?.itemId !== selected.dbId && <button className="drawer-edit-button" type="button" onClick={() => setTestStepsDraft({ itemId: selected.dbId, value: selected.testSteps })}>Edit</button>}</div>{testStepsDraft?.itemId === selected.dbId ? <form className="drawer-text-edit" onSubmit={(event) => { event.preventDefault(); void saveItemText(selected, "testSteps", testStepsDraft.value); }}><textarea aria-label="Edit QA test steps" maxLength={5000} rows={5} value={testStepsDraft.value} onChange={(event) => setTestStepsDraft({ itemId: selected.dbId, value: event.target.value })} placeholder="Add the steps QA should follow, one per line..." /><div className="drawer-edit-actions"><button type="button" className="secondary-button" onClick={() => setTestStepsDraft(null)}>Cancel</button><button type="submit" className="primary-button">Save test steps</button></div></form> : <p className="description-text test-steps-text">{selected.testSteps.trim() || "No QA test steps provided yet."}</p>}</div>}
          <div className="drawer-section">
            <div className="section-title">Comments <span className="comment-count">{comments.length}</span></div>
            {commentsLoading ? <div className="comments-loading">Loading comments…</div> : comments.length > 0 ? <div className="comment-list">
              {comments.map((comment) => <article className="comment-entry" key={`${comment.source}-${comment.id}`}>
                <span className="avatar avatar-small avatar-purple">{initials(comment.authorName)}</span>
                <div className="comment-content"><div className="comment-meta"><b>{comment.authorName}</b>{comment.source === "guest" && <span className="guest-comment-label">Guest</span>}<time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time></div>
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

function ReminderList({ items, onSnooze, onDismiss, onReorder, onDragStart, onDragOver, dragOverItemId, draggable }: { items: Item[]; onSnooze: (item: Item, delay: number) => void; onDismiss: (item: Item) => void; onReorder: (itemId: string) => void; onDragStart: (itemId: string | null) => void; onDragOver: (itemId: string | null) => void; dragOverItemId: string | null; draggable: boolean }) {
  const reminders = items.filter((item) => item.reminder).sort((a, b) => a.sortOrder - b.sortOrder);
  return <div className="panel reminder-list">{reminders.length ? reminders.map((item) => <div className={`reminder-list-row${dragOverItemId === item.dbId ? " drag-over" : ""}`} key={item.id} onDragOver={draggable ? (event) => { event.preventDefault(); onDragOver(item.dbId); } : undefined} onDrop={draggable ? (event) => { event.preventDefault(); event.stopPropagation(); onReorder(item.dbId); } : undefined}><button className="drag-handle reminder-drag-handle" type="button" draggable={draggable} disabled={!draggable} aria-label={`Drag to reorder ${item.title}`} title={draggable ? "Drag to reorder" : "Saving order"} onDragStart={draggable ? (event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.dbId); onDragStart(item.dbId); } : undefined} onDragEnd={draggable ? () => { onDragStart(null); onDragOver(null); } : undefined}><Icon name="grip" size={15} /></button><span className="reminder-list-icon"><Icon name="bell" size={15} /></span><div className="reminder-list-title"><b>{item.title}</b><small>{new Date(item.reminder!).toLocaleString()} · {item.assignee}</small></div><div className="reminder-controls"><button draggable={false} onClick={() => onSnooze(item, 10 * 60 * 1000)}>10 min</button><button draggable={false} onClick={() => onSnooze(item, 60 * 60 * 1000)}>1 hr</button><button draggable={false} onClick={() => onSnooze(item, 24 * 60 * 60 * 1000)}>Tomorrow</button><button draggable={false} onClick={() => onDismiss(item)}>Dismiss</button></div></div>) : <div className="empty-state"><span className="empty-icon"><Icon name="bell" size={20} /></span><b>You&apos;re all caught up</b><p>Add a reminder to any item and it will show up here.</p></div>}</div>;
}

function ItemRow({ item, onClick, extended = false, draggable = false, dragOver = false, onDragStart, onDragOver, onDrop }: { item: Item; onClick: () => void; extended?: boolean; draggable?: boolean; dragOver?: boolean; onDragStart?: (itemId: string | null) => void; onDragOver?: (itemId: string | null) => void; onDrop?: (itemId: string) => void }) {
  const typeTone = item.type === "issue" ? "red" : item.type === "task" ? "blue" : "neutral";
  const statusTone = item.status === "done" ? "green" : item.status === "blocked" ? "red" : item.status === "in_progress" ? "blue" : "neutral";
  return <tr onClick={onClick} className={`item-row${dragOver ? " drag-over" : ""}`} onDragOver={draggable ? (event) => { event.preventDefault(); onDragOver?.(item.dbId); } : undefined} onDrop={draggable ? (event) => { event.preventDefault(); event.stopPropagation(); onDrop?.(item.dbId); } : undefined}><td className="drag-handle-cell">{draggable && <button className="drag-handle" type="button" draggable aria-label={`Drag to reorder ${item.title}`} title="Drag to reorder" onClick={(event) => event.stopPropagation()} onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.dbId); onDragStart?.(item.dbId); }} onDragEnd={() => { onDragStart?.(null); onDragOver?.(null); }}><Icon name="grip" size={15} /></button>}</td><td><div className="item-name"><span className={`type-mark ${item.type}`}>{item.type === "issue" ? "!" : item.type === "task" ? "✓" : "≡"}</span><span><b>{item.title}</b><small>{item.id}{item.tags.length > 0 && <> <i>·</i> {item.tags.map((tag) => `#${tag}`).join(" ")}</>}</small></span></div></td>{extended && <td><Label tone={typeTone}>{typeNames[item.type]}</Label></td>}<td><Label tone={statusTone}><span className="status-dot" />{statusNames[item.status]}</Label></td><td><span className="assignee"><span className="avatar avatar-tiny avatar-purple">{initials(item.assignee)}</span>{item.assignee}</span></td><td><Label tone={item.priority}>{item.priority}</Label></td><td className={item.due === "Today" ? "due-today" : ""}>{item.due}</td></tr>;
}

function ProfileSettings({ user, name, onNameChange, onSaveName, profileSaving, password, onPasswordChange, confirmation, onConfirmationChange, onSavePassword, passwordSaving }: { user: Profile; name: string; onNameChange: (value: string) => void; onSaveName: (event: React.FormEvent<HTMLFormElement>) => void; profileSaving: boolean; password: string; onPasswordChange: (value: string) => void; confirmation: string; onConfirmationChange: (value: string) => void; onSavePassword: (event: React.FormEvent<HTMLFormElement>) => void; passwordSaving: boolean }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  return <div className="profile-settings">
    <form className="profile-settings-form" onSubmit={onSaveName}>
      <div className="profile-form-heading"><b>Personal details</b><span>Your name is shown to teammates across DayTrack.</span></div>
      <label className="form-label" htmlFor="profile-name">Display name<input id="profile-name" className="profile-field" autoComplete="name" maxLength={100} required value={name} onChange={(event) => onNameChange(event.target.value)} /></label>
      <label className="form-label" htmlFor="profile-email">Email address<input id="profile-email" className="profile-field" type="email" value={user.email ?? ""} readOnly /></label>
      <div className="profile-role"><span>Workspace role</span><Label tone={user.role === "admin" ? "green" : "neutral"}>{user.role}</Label></div>
      <button className="primary-button profile-submit" type="submit" disabled={profileSaving || !name.trim() || name.trim() === user.display_name}>{profileSaving ? "Saving..." : "Save name"}</button>
    </form>
    <form className="profile-settings-form" onSubmit={onSavePassword}>
      <div className="profile-form-heading"><b>Password</b><span>Choose a password with at least 8 characters.</span></div>
      <label className="form-label" htmlFor="profile-password">New password<div className="password-field-wrap"><input id="profile-password" type={passwordVisible ? "text" : "password"} autoComplete="new-password" minLength={8} required value={password} onChange={(event) => onPasswordChange(event.target.value)} /><PasswordVisibilityButton visible={passwordVisible} onToggle={() => setPasswordVisible((visible) => !visible)} /></div></label>
      <label className="form-label" htmlFor="profile-password-confirm">Confirm new password<div className="password-field-wrap"><input id="profile-password-confirm" type={confirmationVisible ? "text" : "password"} autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} /><PasswordVisibilityButton visible={confirmationVisible} onToggle={() => setConfirmationVisible((visible) => !visible)} /></div></label>
      <button className="primary-button profile-submit" type="submit" disabled={passwordSaving || !password || !confirmation}>{passwordSaving ? "Updating..." : "Update password"}</button>
    </form>
  </div>;
}

function ReleaseView({ release, items, platforms, canManage, actionPending, onAddItem, onSelectItem, onEditDetails, onToggleShare, onCopyShare, onClose }: {
  release: AppRelease;
  items: Item[];
  platforms: AppPlatform[];
  canManage: boolean;
  actionPending: boolean;
  onAddItem: () => void;
  onSelectItem: (item: Item) => void;
  onEditDetails: () => void;
  onToggleShare: () => void;
  onCopyShare: () => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isClosed = release.status === "closed";
  return <article className="panel release-card">
    <div className="release-card-heading">
      <div className="release-title"><span className={`release-tag${isClosed ? " release-tag-closed" : ""}`}>{release.status.replace("_", " ").toUpperCase()}</span><div className="release-title-line"><div className="release-date"><Icon name="calendar" size={13} /><b>{release.target_date ? formatDueDate(release.target_date) : "Not set"}</b></div><h2>{release.name}</h2></div></div>
      <div className="release-actions">
        {!isClosed && <button className="primary-button" onClick={onAddItem}><Icon name="plus" size={14} /> Add item</button>}
        {canManage && !isClosed && <button className="secondary-button release-action-button" onClick={onEditDetails}>Edit details</button>}
        {canManage && release.public_enabled && release.public_token && <button className="secondary-button release-action-button" onClick={onCopyShare}>Share report</button>}
        {canManage && <button className="secondary-button release-action-button" onClick={onToggleShare} disabled={actionPending}>{actionPending ? "Saving..." : release.public_enabled ? "Disable sharing" : "Share report"}</button>}
        {canManage && !isClosed && <button className="secondary-button release-action-button" onClick={onClose} disabled={actionPending}>{actionPending ? "Saving..." : "Close release"}</button>}
        <button className="quiet-icon release-collapse" aria-label={expanded ? `Collapse ${release.name}` : `Expand ${release.name}`} title={expanded ? "Collapse release details" : "Expand release details"} aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}><Icon name={expanded ? "chevronUp" : "chevronDown"} /></button>
      </div>
    </div>
    {expanded && <div className="release-expanded">
      {release.summary && <p className="release-summary-text">{release.summary}</p>}
      <div className="release-platform-list" aria-label="Release platforms">{release.platformIds.length > 0 ? release.platformIds.map((platformId) => <span key={platformId}>{platforms.find((platform) => platform.id === platformId)?.name ?? "Platform"}</span>) : <span className="release-platform-empty">No platforms assigned</span>}</div>
      <section className="release-linked-items"><div className="section-title">Items in this release <span className="inline-count">{items.length}</span></div>
        {items.length ? items.map((item) => <button className="release-linked-item" key={item.dbId} onClick={() => onSelectItem(item)}><span className={`type-mark ${item.type}`}>{item.type === "issue" ? "!" : item.type === "task" ? "✓" : "≡"}</span><span className="release-linked-title"><b>{item.title}</b><small>{typeNames[item.type]} · {statusNames[item.status]}</small></span><Label tone={item.priority}>{item.priority}</Label></button>) : <p className="release-items-empty">{isClosed ? "This release has no linked items." : "No items linked yet. Add an item to build this release."}</p>}
      </section>
      {release.release_notes && <section className="release-notes-section"><h2>Release notes</h2><p>{release.release_notes}</p></section>}
    </div>}
  </article>;
}

function EmptyWorkspace({ message }: { message: string }) {
  return <div className="panel empty-workspace"><span className="empty-icon"><Icon name="inbox" size={20} /></span><p>{message}</p></div>;
}
