import type { User } from "../api/client";
import { homePath, isAllowedEmail, redirectFor, type Session } from "./session";

const user = (role: string): User => ({
  user_id: 1, email: "a@std.psut.edu.jo", name: "Sara", role, department: "computing",
  onboarding_completed: false, created_at: "2026-11-02T10:00:00Z",
});
const ready = (role: string): Session => ({ status: "ready", user: user(role) });

describe("redirectFor", () => {
  it("sends signed-out users to login, but lets them open sign-up", () => {
    const s: Session = { status: "signedOut" };
    expect(redirectFor(s, "/")).toBe("/login");
    expect(redirectFor(s, "/admin")).toBe("/login");
    expect(redirectFor(s, "/login")).toBeNull();
    expect(redirectFor(s, "/signup")).toBeNull();
  });

  it("keeps unverified and unregistered users on their step", () => {
    expect(redirectFor({ status: "needsVerification", email: "x" }, "/")).toBe("/verify-email");
    expect(redirectFor({ status: "needsVerification", email: "x" }, "/verify-email")).toBeNull();
    expect(redirectFor({ status: "needsRegistration", email: "x" }, "/login")).toBe("/register");
    expect(redirectFor({ status: "deactivated" }, "/")).toBe("/deactivated");
  });

  it("keeps each role in its own area", () => {
    expect(redirectFor(ready("student"), "/")).toBeNull();
    expect(redirectFor(ready("student"), "/admin")).toBe("/");
    expect(redirectFor(ready("student"), "/counsellor/reports")).toBe("/");
    expect(redirectFor(ready("admin"), "/admin")).toBeNull();
    expect(redirectFor(ready("admin"), "/")).toBe("/admin");
    expect(redirectFor(ready("counsellor"), "/admin")).toBe("/counsellor");
    // "/administration" is not the admin area
    expect(redirectFor(ready("admin"), "/administration")).toBe("/admin");
    // settings is shared by every role
    expect(redirectFor(ready("admin"), "/settings")).toBeNull();
    expect(redirectFor(ready("counsellor"), "/settings")).toBeNull();
    expect(redirectFor(ready("student"), "/settings")).toBeNull();
  });

  it("moves signed-in users away from the sign-in screens", () => {
    expect(redirectFor(ready("student"), "/login")).toBe("/");
    expect(redirectFor(ready("admin"), "/register")).toBe("/admin");
  });

  it("waits while loading", () => {
    expect(redirectFor({ status: "loading" }, "/admin")).toBeNull();
  });
});

describe("isAllowedEmail", () => {
  it("accepts PSUT student and staff addresses", () => {
    expect(isAllowedEmail("lina@std.psut.edu.jo")).toBe(true);
    expect(isAllowedEmail("Lina@STD.PSUT.EDU.JO ")).toBe(true);
    expect(isAllowedEmail("dr.x@psut.edu.jo")).toBe(true);
  });
  it("refuses everything else", () => {
    expect(isAllowedEmail("lina@gmail.com")).toBe(false);
    expect(isAllowedEmail("lina@psut.edu.jo.evil.com")).toBe(false);
    expect(isAllowedEmail("std.psut.edu.jo")).toBe(false);
  });
});

it("homePath", () => {
  expect(homePath("student")).toBe("/");
  expect(homePath("admin")).toBe("/admin");
  expect(homePath("counsellor")).toBe("/counsellor");
});
