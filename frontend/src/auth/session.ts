/**
 * Where a user belongs, decided from their login state. Kept free of React so it is easy
 * to test (session.test.ts).
 */
import type { Role, User } from "../api/client";

export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "needsVerification"; email: string }
  | { status: "needsRegistration"; email: string }
  | { status: "deactivated" }
  | { status: "error"; message: string }
  | { status: "ready"; user: User };

export const PUBLIC_PATHS = ["/login", "/signup"];
const STATUS_PATHS = ["/verify-email", "/register", "/deactivated"];

// Students and staff can register; the backend has the final say (ALLOWED_EMAIL_DOMAINS)
export const STUDENT_DOMAIN = "std.psut.edu.jo";
const ALLOWED_DOMAINS = [STUDENT_DOMAIN, "psut.edu.jo"];

export function isAllowedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return email.includes("@") && ALLOWED_DOMAINS.includes(domain);
}

export function homePath(role: Role | string): string {
  if (role === "admin") return "/admin";
  if (role === "counsellor") return "/counsellor";
  return "/";
}

function areaOf(path: string): Role {
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/counsellor" || path.startsWith("/counsellor/")) return "counsellor";
  return "student";
}

/** The path to send the user to, or null if they may stay where they are. */
export function redirectFor(session: Session, path: string): string | null {
  switch (session.status) {
    case "loading":
    case "error":
      return null;
    case "signedOut":
      return PUBLIC_PATHS.includes(path) ? null : "/login";
    case "needsVerification":
      return path === "/verify-email" ? null : "/verify-email";
    case "needsRegistration":
      return path === "/register" ? null : "/register";
    case "deactivated":
      return path === "/deactivated" ? null : "/deactivated";
    case "ready": {
      const home = homePath(session.user.role);
      if (PUBLIC_PATHS.includes(path) || STATUS_PATHS.includes(path)) return home;
      return areaOf(path) === session.user.role ? null : home;
    }
  }
}
