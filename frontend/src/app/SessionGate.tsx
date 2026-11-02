import { Navigate, Outlet, useLocation } from "react-router";

import { useAuth } from "../auth/AuthProvider";
import { redirectFor } from "../auth/session";
import { Button } from "../components/ui";

/** Wraps every page: sends each user to the page that matches their login state and role. */
export function SessionGate() {
  const { session, refresh, signOut } = useAuth();
  const { pathname } = useLocation();

  if (session.status === "loading") {
    return (
      <div className="center-screen" role="status">
        <p className="muted">Loading CampusWell…</p>
      </div>
    );
  }
  if (session.status === "error") {
    return (
      <div className="center-screen">
        <div className="panel narrow stack">
          <h1>Can't load your account</h1>
          <p>{session.message}</p>
          <div className="row">
            <Button onClick={() => void refresh()}>Try again</Button>
            <Button variant="quiet" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  const target = redirectFor(session, pathname);
  if (target && target !== pathname) return <Navigate to={target} replace />;
  return <Outlet />;
}
