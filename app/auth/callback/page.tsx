"use client";

import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getSupabaseClient } from "@/app/lib/supabase";

// Landing page for the Google OAuth redirect. Supabase can return the login
// two ways — `?code=...` (PKCE, exchanged below) or tokens in the URL hash
// (implicit, consumed by getSession). Both must be handled: the first
// version of this page only knew the code form, so implicit-flow logins
// showed "No sign-in code arrived" even though the session established
// itself in the background. Hands off to home on success — the
// AuthProvider's SIGNED_IN handler runs the first sync from there.
//
// Error state starts as null (never derived during render) so the server
// and client first render agree — deriving it from window.location in a
// state initializer caused a hydration mismatch.
function CallbackInner() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const client = getSupabaseClient();
      if (!client) {
        if (!cancelled) setError("Sync isn't set up on this build.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get("error_description") ?? params.get("error");
      if (providerError) {
        if (!cancelled) setError(providerError.slice(0, 200));
        return;
      }
      const code = params.get("code");
      if (code) {
        const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setError(exchangeError.message.slice(0, 200));
          return;
        }
        router.replace("/");
        return;
      }
      // No code: getSession() consumes implicit-flow hash tokens if present
      // and returns the session they establish.
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        router.replace("/");
        return;
      }
      setError("No sign-in code arrived. Try again from the login page.");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      {error ? (
        <p role="alert" className="rounded-lg bg-surface-alt px-3 py-2 text-[14px] font-medium text-error">
          {error}
        </p>
      ) : (
        <p className="text-[15px] text-text-secondary">Finishing sign-in…</p>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
