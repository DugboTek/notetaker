"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold" onClick={() => void signOut()}>
      Sign out
    </button>
  );
}

