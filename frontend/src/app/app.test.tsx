/**
 * The whole app with a fake backend: login state, role areas and registration.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";

// openapi-fetch keeps a reference to fetch when the client is created, so replace it first
const backend = vi.hoisted(() => {
  const responses = new Map<string, { status: number; body: unknown }>();
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const request = input instanceof Request ? input : new Request(input);
    const { pathname } = new URL(request.url);
    const key = `${request.method} ${pathname}`;
    calls.push(key);
    const reply = responses.get(key) ?? { status: 404, body: { detail: "not_found" } };
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { responses, calls };
});

// the test browser has no canvas, so charts are replaced by their accessible label
vi.mock("../components/charts", () => {
  const Stub = ({ label }: { label?: string }) => <div role="img" aria-label={label ?? "chart"} />;
  return { MoodLineChart: Stub, BarChart: Stub, ComboChart: Stub, DoughnutChart: Stub, MultiLineChart: Stub };
});

import { AuthProvider } from "../auth/AuthProvider";
import { routes } from "./router";

const SARA = {
  user_id: 3, email: "sara@dev.campuswell.local", name: "Sara Haddad", role: "student",
  department: "computing", onboarding_completed: true, created_at: "2026-10-01T10:00:00Z",
};

function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  backend.responses.clear();
  backend.calls.length = 0;
  sessionStorage.setItem("campuswell.devUser", "sara"); // signed in with the dev login
  backend.responses.set("GET /api/suggestions/today", {
    status: 200,
    body: { suggestion_id: 1, category: "wellness", message: "Try a breathing exercise.", reason: null,
            was_helpful: null, shown_at: "2026-11-02T10:00:00Z" },
  });
  backend.responses.set("GET /api/moods/stats", {
    status: 200,
    body: { days: 7, total_logs: 7, average_mood: 3.4, streak_days: 7,
            distribution: { "1": 0, "2": 1, "3": 2, "4": 3, "5": 1 }, daily: [] },
  });
  backend.responses.set("GET /api/study/stats", {
    status: 200,
    body: { days: 7, focus_minutes: 50, sessions_completed: 2, sessions_cancelled: 0, tasks_completed: 1,
            tasks_open: 1, tasks_overdue: 0, daily: [] },
  });
  backend.responses.set("GET /api/tasks", {
    status: 200,
    body: [{ task_id: 1, title: "Database assignment", description: null, priority: "high", status: "pending",
             due_date: null, completed_at: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", is_overdue: false }],
  });
  backend.responses.set("GET /api/moods", { status: 200, body: [] });
  backend.responses.set("GET /api/assessments", { status: 200, body: [] });
  backend.responses.set("GET /api/reminders", { status: 200, body: [] });
});

afterEach(() => sessionStorage.clear());

it("a registered student lands on their dashboard", async () => {
  backend.responses.set("GET /api/me", { status: 200, body: SARA });
  renderApp("/");
  expect(await screen.findByRole("heading", { name: /, Sara$/ })).toBeInTheDocument(); // "Good morning, Sara"
  expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  expect(await screen.findByText("Try a breathing exercise.")).toBeInTheDocument();
  expect(await screen.findByText("7 days")).toBeInTheDocument(); // check-in streak
  expect(await screen.findByText("Database assignment")).toBeInTheDocument(); // today's focus
  expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // no support panel without a flag
});

it("the dashboard shows the support panel after a flagged questionnaire", async () => {
  backend.responses.set("GET /api/me", { status: 200, body: SARA });
  backend.responses.set("GET /api/assessments", {
    status: 200,
    body: [{ assessment_id: 9, assessment_type: "PHQ9", taken_at: new Date().toISOString(), total_score: 6,
             severity: "mild", needs_support_message: true, recommend_counselling: false }],
  });
  renderApp("/");
  expect(await screen.findByRole("heading", { name: "You don't have to face this alone" })).toBeInTheDocument();
});

it("a student who opens the admin area is sent home", async () => {
  backend.responses.set("GET /api/me", { status: 200, body: SARA });
  renderApp("/admin");
  expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  expect(backend.calls).not.toContain("GET /api/admin/overview");
});

it("a new user must register, and cannot continue without consent", async () => {
  backend.responses.set("GET /api/me", { status: 403, body: { detail: "not_registered" } });
  renderApp("/");
  expect(await screen.findByRole("heading", { name: "Set up your profile" })).toBeInTheDocument();

  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Your name"), "Lina Nasser");
  await user.selectOptions(screen.getByLabelText("School"), "computing");
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("You need to agree before using CampusWell.")).toBeInTheDocument();
  expect(backend.calls).not.toContain("POST /api/me");
});

it("a deactivated account sees the deactivated page", async () => {
  backend.responses.set("GET /api/me", { status: 403, body: { detail: "account_deactivated" } });
  renderApp("/");
  expect(await screen.findByRole("heading", { name: "Account deactivated" })).toBeInTheDocument();
});

it("a signed-out visitor is sent to sign in", async () => {
  sessionStorage.clear();
  renderApp("/");
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
});
