import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
type AuthState = {
  session: Session | null;
  loading: boolean;
  expired: boolean;
  authError: string | null;
  recovering: boolean;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: Boolean(supabase),
    expired: false,
    authError: null,
    recovering: false,
  });
  const userId = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let eventReceived = false;
    const applySession = (session: Session | null, recovery = false) => {
      if (!mounted) return;
      if (userId.current !== (session?.user.id ?? null)) cache.clear();
      userId.current = session?.user.id ?? null;
      setState((previous) => ({
        session,
        loading: false,
        expired: session ? false : previous.expired,
        authError: null,
        recovering:
          Boolean(session) &&
          (recovery ||
            (previous.recovering &&
              previous.session?.user.id === session?.user.id)),
      }));
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      eventReceived = true;
      applySession(session, event === "PASSWORD_RECOVERY");
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted || eventReceived) return;
        if (error)
          setState({
            session: null,
            loading: false,
            expired: false,
            authError: error.message,
            recovering: false,
          });
        else applySession(data.session);
      })
      .catch(() => {
        if (mounted && !eventReceived)
          setState({
            session: null,
            loading: false,
            expired: false,
            authError: "Unable to restore your session. Please sign in.",
            recovering: false,
          });
      });
    const expire = () => {
      cache.clear();
      userId.current = null;
      setState({
        session: null,
        loading: false,
        expired: true,
        authError: null,
        recovering: false,
      });
      void supabase!.auth.signOut({ scope: "local" });
    };
    window.addEventListener("kopano:session-expired", expire);
    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("kopano:session-expired", expire);
    };
  }, [cache]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required.");
  return context;
}
