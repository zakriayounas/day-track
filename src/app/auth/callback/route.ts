import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next"));
  const client = await createClient();

  if (!client || !code) {
    return NextResponse.redirect(new URL("/reset-password?error=invalid_auth_link", url.origin));
  }

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("Supabase auth callback failed", error);
    return NextResponse.redirect(new URL("/reset-password?error=auth_link_expired", url.origin));
  }

  const destination = new URL(next, url.origin);
  if (destination.origin !== url.origin) {
    return NextResponse.redirect(new URL("/", url.origin));
  }
  return NextResponse.redirect(destination);
}
