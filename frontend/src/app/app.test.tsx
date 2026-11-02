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
});

afterEach(() => sessionStorage.clear());

it("a registered student lands on their home page", async () => {
  backend.responses.set("GET /api/me", { status: 200, body: SARA });
  renderApp("/");
  expect(await screen.findByRole("heading", { name: "Hello, Sara" })).toBeInTheDocument();
  expect(await screen.findByText("Try a breathing exercise.")).toBeInTheDocument();
  expect(await screen.findByText("7 days")).toBeInTheDocument();
});

it("a student who opens the admin area is sent home", async () => {
  backend.responses.set("GET /api/me", { status: 200, body: SARA });
  renderApp("/admin");
  expect(await screen.findByRole("heading", { name: "Hello, Sara" })).toBeInTheDocument();
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
  expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
});
