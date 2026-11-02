import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileHeart,
  Heart,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Smile,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useMatches } from "react-router";

import type { Role } from "../api/client";
import { useAuth, useCurrentUser } from "../auth/AuthProvider";
import { Logo } from "../components/Logo";
import { ReminderNotifier } from "../components/ReminderNotifier";

type NavItem = { to: string; label: string; icon: LucideIcon };

// Each role's menu (GP1 figure 4.24 for students)
const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/mood", label: "Mood Tracker", icon: Smile },
    { to: "/study", label: "Study Tools", icon: BookOpen },
    { to: "/wellbeing", label: "Well-Being", icon: Heart },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/check-in", label: "Self-Check", icon: ClipboardCheck },
    { to: "/community", label: "Community", icon: MessagesSquare },
  ],
  admin: [
    { to: "/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/admin/moderation", label: "Moderation", icon: ShieldCheck },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/content", label: "Wellness Content", icon: FileHeart },
  ],
  counsellor: [{ to: "/counsellor", label: "Campus Trends", icon: BarChart3 }],
};

const ROLE_LABEL: Record<Role, string> = { student: "PSUT Student", admin: "Administrator", counsellor: "Counsellor" };

export type RouteHandle = { title: string };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

/** The frame around every signed-in page: sidebar, top bar, footer (GP1 figures 4.24–4.29). */
export function Layout() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const role = user.role as Role;
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const matches = useMatches();
  const title = [...matches].reverse().map((m) => (m.handle as RouteHandle | undefined)?.title).find(Boolean) ?? "CampusWell";

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    document.title = `${title} · CampusWell`;
  }, [title]);

  return (
    <div className="app">
      {role === "student" && <ReminderNotifier />}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`} aria-label="Main menu">
        <div className="row spread" style={{ flexWrap: "nowrap" }}>
          <Link to={NAV[role][0].to} style={{ textDecoration: "none" }}><Logo /></Link>
          {menuOpen && (
            <button type="button" className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
          )}
        </div>
        <nav className="nav">
          {NAV[role].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end className="navlink">
              <Icon size={20} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className="navlink"><Settings size={20} aria-hidden /> Settings</NavLink>
          <div className="usercard">
            <span className="avatar" aria-hidden>{initials(user.name)}</span>
            <div className="who">
              <strong>{user.name}</strong>
              <span className="small muted">{ROLE_LABEL[role]}</span>
            </div>
            <button type="button" className="icon-btn" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden />}

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <h1>{title}</h1>
          {role === "student" && (
            <Link to="/study" className="btn btn-secondary">New Task</Link>
          )}
        </header>
        <main className="content">
          <Outlet />
        </main>
        <footer className="footer">© {new Date().getFullYear()} CampusWell · Student Well-being Platform · PSUT</footer>
      </div>
    </div>
  );
}
