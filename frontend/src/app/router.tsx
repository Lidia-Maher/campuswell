import type { ReactNode } from "react";
import { createBrowserRouter, type RouteObject } from "react-router";

import { AdminHome } from "../pages/admin/AdminHome";
import { ContentPage } from "../pages/admin/ContentPage";
import { ModerationPage } from "../pages/admin/ModerationPage";
import { UsersPage } from "../pages/admin/UsersPage";
import { DeactivatedPage } from "../pages/auth/DeactivatedPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { SignupPage } from "../pages/auth/SignupPage";
import { VerifyEmailPage } from "../pages/auth/VerifyEmailPage";
import { CounsellorHome } from "../pages/counsellor/CounsellorHome";
import { NotFoundPage } from "../pages/NotFoundPage";
import { SettingsPage } from "../pages/SettingsPage";
import { AnalyticsPage } from "../pages/student/AnalyticsPage";
import { CommunityPage } from "../pages/student/CommunityPage";
import { DashboardPage } from "../pages/student/DashboardPage";
import { MoodPage } from "../pages/student/MoodPage";
import { SelfCheckPage } from "../pages/student/SelfCheckPage";
import { StudyPage } from "../pages/student/StudyPage";
import { WellbeingPage } from "../pages/student/WellbeingPage";
import { Layout, type RouteHandle } from "./Layout";
import { SessionGate } from "./SessionGate";

const page = (path: string, title: string, element: ReactNode): RouteObject =>
  ({ path, element, handle: { title } satisfies RouteHandle });

export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    children: [
      // before the user is fully signed in (no menu)
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/verify-email", element: <VerifyEmailPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/deactivated", element: <DeactivatedPage /> },

      // signed in: SessionGate keeps each role in its own area
      {
        element: <Layout />,
        children: [
          // students (GP1 figures 4.24–4.28)
          page("/", "Dashboard", <DashboardPage />),
          page("/mood", "Mood Tracker", <MoodPage />),
          page("/study", "Study Tools", <StudyPage />),
          page("/wellbeing", "Well-Being Tools", <WellbeingPage />),
          page("/analytics", "Analytics Dashboard", <AnalyticsPage />),
          page("/check-in", "Self-Check", <SelfCheckPage />),
          page("/community", "Community", <CommunityPage />),
          // administrators
          page("/admin", "Overview", <AdminHome />),
          page("/admin/moderation", "Moderation", <ModerationPage />),
          page("/admin/users", "Users", <UsersPage />),
          page("/admin/content", "Wellness Content", <ContentPage />),
          // counsellors
          page("/counsellor", "Campus Trends", <CounsellorHome />),
          // everyone (GP1 figure 4.29)
          page("/settings", "Settings", <SettingsPage />),
          page("*", "Not found", <NotFoundPage />),
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
