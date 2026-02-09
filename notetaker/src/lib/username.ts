export function usernameToEmail(usernameRaw: string) {
  const input = usernameRaw.trim().toLowerCase();

  // If the user typed a real email, use it as-is (don't "username-map" it).
  if (input.includes("@")) return input;

  // Supabase Auth uses email/password. For a simple "username" UX, map to a stable local email.
  const safe = input.replace(/[^a-z0-9_-]/g, "");
  if (!safe) return "";
  return `${safe}@notetaker.user`;
}
