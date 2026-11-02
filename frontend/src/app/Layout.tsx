import { NavLink, Outlet } from "react-router";

import type { Role } from "../api/client";
import { useAuth, useCurrentUser } from "../auth/AuthProvider";
import { Button } from "../components/ui";

// Each role's menu. Screens are added here as they are built.
const NAV: Record<Role, { to: string; label: string }[]> = {
  student: [{ to: "/", label: "Home" }],
  admin: [{ to: "/admin", label: "Overview" }],
  counsellor: [{ to: "/counsellor", label: "Reports" }],
};

const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  admin: "Administrator",
  counsellor: "Counsellor",
};

/** The frame around every signed-in page: header, menu, sign out. */
export function Layout() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const role = user.role as Role;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">CampusWell</span>
          <nav aria-label="Main">
            {NAV[role].map((item) => (
              <NavLink key={item.to} to={item.to} end className="navlink">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="who">
            <span>
              {user.name} <span className="muted">· {ROLE_LABEL[role]}</span>
            </span>
            <Button variant="quiet" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
