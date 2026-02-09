"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { usernameToEmail } from "@/lib/username";
import { errorMessage } from "@/lib/errors";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setBusy(true);
    try {
      const email = usernameToEmail(username);
      if (!email) throw new Error("Enter a username.");
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");

      if (mode === "signup") {
        const { error: signUpErr } = await supabase.auth.signUp({ email, password });
        if (signUpErr) throw signUpErr;
      } else {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signInErr) throw signInErr;
      }

      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      setError(errorMessage(e) || "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_10%_10%,rgba(34,197,94,0.16),transparent_55%),radial-gradient(900px_circle_at_85%_20%,rgba(59,130,246,0.14),transparent_55%),linear-gradient(to_bottom,#fbfbf8,#f3f5f7)]">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm backdrop-blur">
          <div className="text-xs font-semibold tracking-wide text-black/60">Notetaker</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Use a simple <span className="font-medium">username + password</span>, or sign in with your email. Under the
            hood, usernames are mapped to a local email for Supabase Auth.
          </p>

          <div className="mt-6 space-y-3">
            <label className="block">
              <div className="text-xs font-medium text-black/60">Username or email</div>
              <input
                className="mt-1 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-black/30"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="e.g. sister or sdugbo@gmail.com"
              />
            </label>
            <label className="block">
              <div className="text-xs font-medium text-black/60">Password</div>
              <input
                className="mt-1 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-black/30"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
              />
            </label>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <button
            className="mt-5 w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>

          <div className="mt-4 flex items-center justify-between text-sm text-black/60">
            <button
              className="underline"
              onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
              disabled={busy}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
