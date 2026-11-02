import { useQueryClient } from "@tanstack/react-query";
import { onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from "firebase/auth";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, setTokenSource, unwrap } from "../api/client";
import { ApiError, messageFor } from "../api/errors";
import { firebaseAuth } from "./firebase";
import type { Session } from "./session";

const DEV_USER_KEY = "campuswell.devUser";

type AuthContextValue = {
  session: Session;
  /** Ask the backend again who the user is (after registering, verifying, ...). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  devSignIn: (name: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readDevUser(): string | null {
  try {
    return sessionStorage.getItem(DEV_USER_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null | undefined>(
    firebaseAuth ? undefined : null, // undefined = Firebase has not answered yet
  );
  const [devUser, setDevUser] = useState<string | null>(readDevUser);

  useEffect(() => {
    if (!firebaseAuth) return;
    return onAuthStateChanged(firebaseAuth, setFirebaseUser);
  }, []);

  useEffect(() => {
    setTokenSource(async () => {
      if (devUser) return `dev:${devUser}`;
      const user = firebaseAuth?.currentUser;
      return user ? user.getIdToken() : null; // Firebase renews the token when it expires
    });
  }, [devUser]);

  const refresh = useCallback(async () => {
    if (firebaseUser === undefined && !devUser) return; // still loading
    if (!devUser && !firebaseUser) return setSession({ status: "signedOut" });
    if (!devUser && firebaseUser && !firebaseUser.emailVerified) {
      return setSession({ status: "needsVerification", email: firebaseUser.email ?? "" });
    }
    try {
      const user = await unwrap(api.GET("/api/me"));
      setSession({ status: "ready", user });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "not_registered") {
        setSession({ status: "needsRegistration", email: firebaseUser?.email ?? `${devUser}@dev` });
      } else if (code === "account_deactivated") {
        setSession({ status: "deactivated" });
      } else if (code === "invalid_token" || code === "token_expired" || code === "missing_token") {
        setSession({ status: "signedOut" });
      } else {
        setSession({ status: "error", message: messageFor(error) });
      }
    }
  }, [firebaseUser, devUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem(DEV_USER_KEY);
    } catch {
      // storage unavailable: nothing to remove
    }
    setDevUser(null);
    if (firebaseAuth?.currentUser) await firebaseSignOut(firebaseAuth);
    queryClient.clear(); // never show the previous user's data to the next one
    setSession({ status: "signedOut" });
  }, [queryClient]);

  const devSignIn = useCallback(async (name: string) => {
    const clean = name.trim().toLowerCase();
    try {
      sessionStorage.setItem(DEV_USER_KEY, clean);
    } catch {
      // storage unavailable: the dev login lasts until the page reloads
    }
    queryClient.clear();
    setSession({ status: "loading" });
    setDevUser(clean);
  }, [queryClient]);

  const value = useMemo(() => ({ session, refresh, signOut, devSignIn }), [session, refresh, signOut, devSignIn]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** The signed-in, registered user. Only use on pages behind the session gate. */
export function useCurrentUser() {
  const { session } = useAuth();
  if (session.status !== "ready") throw new Error("useCurrentUser used before the user is ready");
  return session.user;
}
