import { createBrowserRouter, type RouteObject } from "react-router";

import { AdminHome } from "../pages/admin/AdminHome";
import { DeactivatedPage } from "../pages/auth/DeactivatedPage";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { SignupPage } from "../pages/auth/SignupPage";
import { VerifyEmailPage } from "../pages/auth/VerifyEmailPage";
import { CounsellorHome } from "../pages/counsellor/CounsellorHome";
import { NotFoundPage } from "../pages/NotFoundPage";
import { StudentHome } from "../pages/student/StudentHome";
import { Layout } from "./Layout";
import { SessionGate } from "./SessionGate";

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
          { path: "/", element: <StudentHome /> },
          { path: "/admin", element: <AdminHome /> },
          { path: "/counsellor", element: <CounsellorHome /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
