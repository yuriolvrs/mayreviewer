import { getSupabaseClient } from "@/app/lib/supabase";

// The public handle shown beside shared reviewers ("Name#tag"). One row per
// user in `profiles`; the (name, tag) pair is unique case-insensitively.

export type Profile = { displayName: string; tag: string };

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; taken: true }
  | { ok: false; taken?: false; error: string };

const OFFLINE = "Sharing needs the online version.";
const TAG_RE = /^[A-Za-z0-9]{3,5}$/;

export function validateProfileInput(name: string, tag: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1) return "Enter a display name.";
  if (trimmed.length > 32) return "Display name can be at most 32 characters.";
  if (!TAG_RE.test(tag)) return "Tag must be 3 to 5 letters or numbers.";
  return null;
}

export function formatHandle(name: string, tag: string): string {
  return `${name}#${tag}`;
}

export async function getMyProfile(): Promise<Profile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data: session } = await client.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return null;
    const { data, error } = await client
      .from("profiles")
      .select("display_name, tag")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return { displayName: data.display_name as string, tag: data.tag as string };
  } catch {
    return null;
  }
}

export async function saveProfile(name: string, tag: string): Promise<SaveProfileResult> {
  const invalid = validateProfileInput(name, tag);
  if (invalid) return { ok: false, error: invalid };
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: OFFLINE };
  try {
    const { data: session } = await client.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return { ok: false, error: "Sign in to set a display name." };
    const { error } = await client.from("profiles").upsert({
      user_id: userId,
      display_name: name.trim(),
      tag,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") return { ok: false, taken: true };
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't save your profile." };
  }
}
