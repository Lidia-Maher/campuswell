# CampusWell – Frontend

React + TypeScript website, built with Vite. It talks to the backend in `../backend`
(live at https://campuswell-api.onrender.com) and signs users in with Firebase.

## 1. Run it on your computer

Requirements: Node.js 22 or newer.

```bash
cd frontend
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm run dev
```

Open http://localhost:5173.

**Without Firebase (easiest).** Keep `VITE_DEV_LOGIN=true` and `VITE_API_URL=http://localhost:8000`,
and run the backend on your laptop with `AUTH_DEV_MODE=true` (see `../backend/README.md`).
The sign-in page then shows buttons to log in as the demo users: Sara (student), Noor
(student whose questionnaire triggers the support message), Admin and Counsellor.

**With Firebase.** Fill in `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` from the Firebase
console (Project settings → General → Your apps). Sign-up only accepts verified
`@std.psut.edu.jo` (students) and `@psut.edu.jo` (staff) emails.

## 2. How the code is organised

| Folder | What is in it |
|--------|---------------|
| `src/api/` | `client.ts`: the only place that calls the backend. `schema.d.ts`: generated types for every endpoint. `errors.ts`: backend error codes → messages for users. |
| `src/auth/` | Firebase setup, `AuthProvider` (who is signed in), `session.ts` (which page each user belongs on) |
| `src/app/` | The page list (`router.tsx`), the frame around signed-in pages (`Layout.tsx`), the gate that redirects users (`SessionGate.tsx`) |
| `src/components/ui.tsx` | Shared buttons, form fields, alerts |
| `src/pages/` | One folder per area: `auth/`, `student/`, `admin/`, `counsellor/` |
| `src/styles.css` | All styling. Colours and fonts are variables at the top. |

## 3. Calling the backend

```ts
import { api, unwrap } from "../api/client";

const stats = useQuery({
  queryKey: ["moods", "stats", 7],
  queryFn: () => unwrap(api.GET("/api/moods/stats", { params: { query: { days: 7 } } })),
});
```

- `api.GET / POST / PATCH / PUT / DELETE` know every endpoint, its parameters and its
  response. A typo in a path or field name is a red underline in VS Code.
- `unwrap` returns the data or throws an `ApiError`; show it with `messageFor(error)`.
- The login token is added automatically.
- When the backend changes, regenerate the types. Most reliable (no server needed): in
  `backend/` run `python -m app.openapi`, then here `npm run api:types:file`.
  Alternatives: `npm run api:types` (live API) or `npm run api:types:local` (a running local
  backend; restart it first if you changed backend code).

## 4. Adding a page

1. Create it in `src/pages/<area>/`.
2. Add it to `routes` in `src/app/router.tsx` (student pages at `/...`, admin pages under
   `/admin/...`, counsellor pages under `/counsellor/...`; the gate keeps each role in its area).
3. Add it to the menu in `src/app/Layout.tsx`.

## 5. Checks

```bash
npm run typecheck   # TypeScript
npm test            # tests (Vitest)
npm run build       # production build
```

GitHub runs all three on every push that changes `frontend/`.

## 6. Deploying to Vercel

New Project → import the GitHub repo, then:

- Root directory: `frontend` (Vercel detects Vite)
- Environment variables: `VITE_API_URL=https://campuswell-api.onrender.com` and the four
  `VITE_FIREBASE_*` values. **Do not** set `VITE_DEV_LOGIN` there.
- After the first deploy: add the Vercel address to the backend's `CORS_ORIGINS` on Render,
  and to Firebase → Authentication → Settings → Authorized domains.
