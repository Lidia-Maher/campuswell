# CampusWell – Backend

FastAPI + SQLAlchemy + Alembic + PostgreSQL. Authentication is done by Firebase on the frontend; the backend only verifies Firebase ID tokens.

What is ready:

- All 14 tables of the GP2 design as SQLAlchemy models (`app/models/`), one file per module.
- One Alembic migration (`alembic/versions/..._0001_initial_schema.py`) that creates exactly the same database as `database/schema.sql`, including the triggers and the two views.
- Firebase token verification and role checks (`app/auth.py`).
- Endpoints for every feature: account, mood tracker, tasks + Pomodoro, PHQ-9 / GAD-7,
  wellness library, community + moderation, reminders, admin, counsellor reports and
  rule-based suggestions (full list at the end of this file).
- 67 automated tests (`tests/`), also run by GitHub on every push.

## 1. Run it on your computer

Requirements: Python 3.12 and a PostgreSQL database (a free Neon project is easiest).

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # then edit .env: set DATABASE_URL
alembic upgrade head        # creates all tables in your database
uvicorn app.main:app --reload
```

Open http://localhost:8000/docs to see and try every endpoint.

**Testing without Firebase.** Set `AUTH_DEV_MODE=true` in `.env`, then in /docs click *Authorize* and enter `dev:sara`. You are now a fake user called "sara". Call `POST /api/me` once to register, then use the other endpoints. Use `dev:omar` etc. for other users. The app refuses to start if this is enabled with `ENVIRONMENT=production`.

## 2. Firebase setup (one person does this once)

1. Firebase console → Project settings → Service accounts → *Generate new private key*.
2. Save the file as `backend/firebase-service-account.json` (already in `.gitignore`, **never commit it**).
3. In `.env`: `FIREBASE_CREDENTIALS_PATH=./firebase-service-account.json`

## 3. How login works

1. The frontend signs the user in with Firebase and gets an ID token: `await user.getIdToken()`.
2. Every request sends `Authorization: Bearer <token>`.
3. `GET /api/me`:
   - `200` → registered, continue to the dashboard.
   - `403 not_registered` → show the registration screen (name, department, consent checkbox), then `POST /api/me`.
   - `403 account_deactivated` → an admin deactivated the account.
   - Registration (`POST /api/me`) needs a **verified** email ending in `std.psut.edu.jo` (students) or `psut.edu.jo` (staff); change the list with `ALLOWED_EMAIL_DOMAINS`. Otherwise:
     - `403 email_not_verified` → call `user.sendEmailVerification()`, ask the user to click the link, then get a fresh token with `user.getIdToken(true)` and try again.
     - `403 email_domain_not_allowed` → "Please use your university email."
4. Deleting the account: `DELETE /api/me` removes all data, then the frontend calls Firebase `user.delete()`.

## 4. Changing the database (migrations)

Never edit tables by hand in Neon. Instead:

```bash
# 1. change a model in app/models/
alembic revision --autogenerate -m "add is_anonymous to posts"
# 2. open the new file in alembic/versions/ and check it
alembic upgrade head
# 3. commit the model change AND the migration file together
```

When you pull a teammate's changes, run `alembic upgrade head`. `alembic check` tells you if the models and migrations are out of sync. Views, triggers and partial indexes are not always detected automatically; write those by hand with `op.execute(...)` (see the first migration).

## 5. Adding a new feature (copy the mood tracker)

Each feature has the same three parts:

| Part | Mood tracker example | Purpose |
|------|----------------------|---------|
| `app/models/` | `mood.py` | database table (already done for all features) |
| `app/schemas/` | `mood.py` | what the API accepts and returns (Pydantic) |
| `app/routers/` | `moods.py` | the endpoints |

Then register the router in `app/main.py` and add tests in `tests/`. Rules every endpoint follows:

- Use `user: User = Depends(get_current_user)` and always filter by `user.user_id`, so students only ever see their own data.
- Return `404` (not `403`) when a row belongs to someone else (`get_own_or_404` in `app/utils.py` does this).
- Admin/counsellor endpoints use `Depends(require_role("admin"))`. In tests, the `register_staff` fixture creates an admin or counsellor.
- Group by day in Amman time (`local_day` / `local_today` in `app/utils.py`).
- Counsellors only ever see aggregates, and groups of fewer than 5 students are hidden.

## 6. Running the tests

Create a second, empty database whose name ends in `_test` (the tests delete all its data):

```bash
TEST_DATABASE_URL=postgresql://user:pass@host/campuswell_test pytest
# Windows PowerShell:
# $env:TEST_DATABASE_URL="postgresql://..."; pytest
```

GitHub also runs the tests on every push and pull request that changes `backend/`
(`.github/workflows/backend-tests.yml`), with its own temporary database. A red ✗ next to
a commit on GitHub means a test failed; click it to see which one.

## 6b. Demo data

Fill your database with realistic test data (26 users, 30 days of moods, tasks,
focus sessions, posts, assessments and more):

```bash
python -m app.seed --reset     # --reset erases ALL existing data first
```

Then, with `AUTH_DEV_MODE=true`, log in at /docs as `dev:sara` (a student with a check-in
every day), `dev:admin` or `dev:counsellor`. Every seeded student works the same way,
for example `dev:omar`. The queries in `database/demo_queries.sql` show the views,
analytics and constraints in Neon's SQL Editor. The script refuses to run when
`ENVIRONMENT=production`.

## 7. Deploying to Render

New → Web Service → connect the GitHub repo, then:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Environment variables: `ENVIRONMENT=production`, `DATABASE_URL`, `CORS_ORIGINS` (your Vercel URL), and `FIREBASE_CREDENTIALS_JSON` (the whole service account file pasted as one line).

After the first deploy, open the service's **Shell** tab once and run:

```bash
python -m app.seed --content-only               # wellness library and tips, no fake users
python -m app.make_admin someone@psut.edu.jo    # after that person has registered in the app
```

`make_admin` also takes `--role counsellor`. After the first admin exists, roles can be changed in the app (`PATCH /api/admin/users/{id}`).

The free plan sleeps after inactivity, so open `/health` a minute before any demo.

## Endpoints

All `/api` endpoints need a token. "Admin" and "counsellor" mean the endpoint requires that role.

### Account and mood

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | server and database check |
| GET | `/api/me` | current user (also records last login) |
| POST | `/api/me` | register after first Firebase login |
| PATCH | `/api/me` | update name, department, onboarding flag |
| DELETE | `/api/me` | delete account and all data |
| POST | `/api/moods` | log a mood (1–5), optional note and privacy flag |
| GET | `/api/moods` | mood history, optional `start` / `end` dates |
| DELETE | `/api/moods/{log_id}` | delete one of your own logs |
| GET | `/api/moods/stats?days=30` | average, daily averages, 7-day moving average, streak, distribution |

### Study (tasks and Pomodoro)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tasks` | add a task (title, priority, optional due date) |
| GET | `/api/tasks` | your tasks, soonest due first; filter `?status=` or `?overdue=true` |
| GET / PATCH / DELETE | `/api/tasks/{task_id}` | view, edit (incl. status) or delete; `completed_at` is set automatically |
| POST | `/api/pomodoro` | save a session when it ends (completed or cancelled, optional `task_id`) |
| GET | `/api/pomodoro` | session history, optional `start` / `end` / `task_id` |
| GET | `/api/study/stats?days=7` | focus minutes and completed tasks per day, open and overdue tasks |

### Assessments (PHQ-9 / GAD-7)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/assessments` | submit all answers at once; returns score, severity, `needs_support_message`, `recommend_counselling` |
| GET | `/api/assessments` | your results over time, optional `?type=PHQ9` |
| GET | `/api/assessments/{id}` | one result with its answers |

If `needs_support_message` is true (PHQ-9 question 9 above 0), the app must show the
support / crisis contacts immediately. `recommend_counselling` (score 15 or more) is the
gentler "talking to a counsellor could help" message.

### Wellness

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wellness/content` | the library, optional `?category=`; admins can add `?include_inactive=true` |
| GET | `/api/wellness/content/{id}` | one item |
| POST / PATCH | `/api/wellness/content[/{id}]` | admin: add or edit content (deactivate with `is_active: false`) |
| POST | `/api/wellness/sessions` | save a meditation / breathing session when it ends |
| GET | `/api/wellness/sessions` | your session history |
| GET | `/api/wellness/stats?days=30` | sessions, minutes, days practised, minutes per category |

### Community

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/posts` | new post (waits for admin approval); `429 post_limit_reached` after 10 a day |
| GET | `/api/posts` | approved feed, newest first, with likes; page with `?before_id=` |
| GET | `/api/posts/mine` | your posts with status and rejection reason |
| DELETE | `/api/posts/{id}` | delete your own post (admins: any post) |
| PUT / DELETE | `/api/posts/{id}/like` | like / unlike |
| POST | `/api/posts/{id}/report` | report a post (once per user) |
| GET | `/api/admin/posts` | admin: moderation queue, `?status=pending` (default), `?reported_only=true` |
| POST | `/api/admin/posts/{id}/review` | admin: approve or reject (reason required) |
| GET | `/api/admin/reports` | admin: reports, `?status=open` (default) |
| POST | `/api/admin/reports/{id}/resolve` | admin: `dismissed`, or `action_taken` (removes the post, closes its reports) |

### Reminders

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reminders` | all three reminder settings (defaults are off) |
| PUT | `/api/reminders/{type}` | set time / on-off for `mood_checkin`, `study` or `wellness` |

The backend only stores the settings; sending the notifications is done by the frontend.

### Suggestions (FR-11, rule-based)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suggestions/today` | today's tip with the reason it was chosen (same tip all day) |
| GET | `/api/suggestions` | tips shown before |
| POST | `/api/suggestions/{id}/feedback` | "was this helpful?" |
| GET / POST / PATCH | `/api/admin/suggestion-templates[/{id}]` | admin: manage tips |

### Admin and counsellor

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/overview` | admin: dashboard numbers |
| GET | `/api/admin/users` | admin: users, filter by `role`, `department`, `is_active`, `search` |
| PATCH | `/api/admin/users/{id}` | admin: deactivate / reactivate, change role or department |
| GET | `/api/counsellor/mood-trends?days=30` | counsellor/admin: anonymized daily mood per department |
| GET | `/api/counsellor/assessment-summary?days=30` | counsellor/admin: students per severity band per department |
