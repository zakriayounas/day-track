import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type InviteRequest = {
  email?: unknown;
  displayName?: unknown;
  role?: unknown;
};

export async function POST(request: Request) {
  const sessionClient = await createSupabaseServerClient();
  if (!sessionClient) {
    return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });
  }

  const { data: authData, error: authError } = await sessionClient.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ error: "Sign in before inviting a teammate." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: `Could not verify admin permissions: ${profileError.message}` }, { status: 500 });
  }
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    return NextResponse.json({ error: "Only an active admin can invite teammates." }, { status: 403 });
  }

  let body: InviteRequest;
  try {
    body = await request.json() as InviteRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const role = body.role === "admin" ? "admin" : body.role === "user" ? "user" : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!displayName || displayName.length > 100) {
    return NextResponse.json({ error: "Name is required and must be 100 characters or fewer." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Choose a valid team role." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY in the server environment to invite team members." }, { status: 500 });
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: new URL("/auth/callback?next=%2Freset-password%3Fmode%3Dinvite", request.url).toString(),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data.user) {
    return NextResponse.json({ error: "Supabase did not return the invited user." }, { status: 502 });
  }

  const { error: upsertError } = await adminClient.from("profiles").upsert({
    id: data.user.id,
    email,
    display_name: displayName,
    role,
    is_active: true,
  }, { onConflict: "id" });
  if (upsertError) {
    return NextResponse.json({ error: `Invitation was sent, but the team profile could not be saved: ${upsertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    member: { id: data.user.id, email, display_name: displayName, role },
  }, { status: 201 });
}
