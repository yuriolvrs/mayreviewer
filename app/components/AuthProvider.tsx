"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/app/lib/supabase";
import DisplayNamePrompt from "@/app/components/DisplayNamePrompt";
import { getMyProfile, type Profile } from "@/app/lib/profile";
import { clearLocalSyncedData, getSyncMeta, syncNow } from "@/app/lib/sync";

export type AuthResult = {
  ok: boolean;
  // Set when the account was created but the session needs email confirmation
  // first (depends on the project's "Confirm email" auth setting).
  needsConfirmation?: boolean;
  error?: string;
};

export type SignOutResult = {
  // False when the pre-logout flush failed (offline or server error) and the
  // device copy was kept to avoid data loss. Callers with notice UI should
  // say so; the next login merges the kept rows up.
  flushed: boolean;
};

type AuthContextValue = {
  // False when the Supabase keys are absent — the app runs local-only and
  // auth UI explains setup instead of failing.
  configured: boolean;
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<SignOutResult>;
};

const AuthContext = createContext<AuthContextValue>({
  configured: false,
  user: null,
  loading: true,
  signUpWithEmail: async () => ({ ok: false, error: "Sync is not set up yet." }),
  signInWithEmail: async () => ({ ok: false, error: "Sync is not set up yet." }),
  signInWithGoogle: async () => ({ ok: false, error: "Sync is not set up yet." }),
  signOut: async () => ({ flushed: true }),
});

export type DisplayNamePromptValue = {
  // Opens the "Pick your display name" modal, even after "Not now".
  openDisplayNamePrompt: () => void;
  // Null while loading, signed out, or when the user has no profile yet.
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
};

const DisplayNamePromptContext = createContext<DisplayNamePromptValue>({
  openDisplayNamePrompt: () => {},
  profile: null,
  refreshProfile: async () => {},
});

function shortError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message.slice(0, 200);
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Unconfigured builds never load a session, so they start unloaded —
  // derived once from env, not set inside the effect below.
  const [loading, setLoading] = useState(() => getSupabaseClient() !== null);
  const configured = isSupabaseConfigured();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  // Id of the user whose sign-in sync has settled; gates the profile check.
  const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    client.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(data.session?.user ?? null);
        setSyncedUserId(data.session?.user.id ?? null);
        setLoading(false);
      }
    });
    const { data: subscription } = client.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;
      setUser(nextSession?.user ?? null);
      setLoading(false);
      // Any fresh sign-in converges local and cloud immediately: the first
      // login merges this device's local data up, later logins pull the
      // other device's changes down.
      if (event === "SIGNED_IN" && nextSession?.user) {
        const incomingId = nextSession.user.id;
        // Account switch on a shared device: the previous owner's leftovers
        // survive only when their logout couldn't flush (offline). Either
        // way they must not merge into the incoming account's cloud, so the
        // device starts empty and pulls the incoming account down fresh.
        // (Same-account sign-ins skip this — their leftovers are theirs.)
        if (getSyncMeta().lastUserId && getSyncMeta().lastUserId !== incomingId) {
          void clearLocalSyncedData()
            .then(() => syncNow(incomingId))
            .finally(() => !cancelled && setSyncedUserId(incomingId));
        } else {
          void syncNow(incomingId).finally(() => !cancelled && setSyncedUserId(incomingId));
        }
      }
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id ?? null;

  const refreshProfile = useCallback(async () => {
    setProfile(await getMyProfile());
  }, []);

  // After sign-in sync, look up the profile once; offer the prompt when the
  // user has none, unless they already dismissed it this session.
  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfile(null);
      setPromptOpen(false);
      return;
    }
    if (syncedUserId !== userId) return;
    let cancelled = false;
    void getMyProfile().then((p) => {
      if (cancelled) return;
      setProfile(p);
      if (!p && !dismissedRef.current) setPromptOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, syncedUserId]);

  const promptValue: DisplayNamePromptValue = {
    openDisplayNamePrompt: () => setPromptOpen(true),
    profile,
    refreshProfile,
  };

  const value: AuthContextValue = {
    configured,
    user,
    loading,
    signUpWithEmail: async (email, password) => {
      const client = getSupabaseClient();
      if (!client) return { ok: false, error: "Sync is not set up yet." };
      try {
        const { data, error } = await client.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) return { ok: true, needsConfirmation: true };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: shortError(err, "Sign-up failed.") };
      }
    },
    signInWithEmail: async (email, password) => {
      const client = getSupabaseClient();
      if (!client) return { ok: false, error: "Sync is not set up yet." };
      try {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: shortError(err, "Sign-in failed.") };
      }
    },
    signInWithGoogle: async () => {
      const client = getSupabaseClient();
      if (!client) return { ok: false, error: "Sync is not set up yet." };
      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: shortError(err, "Google sign-in failed.") };
      }
    },
    signOut: async () => {
      // Push-then-clear: the device copy is private to the signed-in owner,
      // so logout empties it — but only once the cloud holds everything, or
      // an offline logout would silently destroy unsynced work. On flush
      // failure the rows stay and the caller is told (next login merges them
      // up); the login also restores from the cloud regardless.
      let flushed = true;
      if (user) {
        flushed = (await syncNow(user.id)).ok;
        if (flushed) await clearLocalSyncedData();
      }
      const client = getSupabaseClient();
      if (client) await client.auth.signOut();
      return { flushed };
    },
  };

  return (
    <AuthContext.Provider value={value}>
      <DisplayNamePromptContext.Provider value={promptValue}>
        {children}
        {promptOpen && user && (
          <DisplayNamePrompt
            onSaved={(p) => {
              setProfile(p);
              setPromptOpen(false);
            }}
            onClose={() => {
              dismissedRef.current = true;
              setPromptOpen(false);
            }}
          />
        )}
      </DisplayNamePromptContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function useDisplayNamePrompt(): DisplayNamePromptValue {
  return useContext(DisplayNamePromptContext);
}
