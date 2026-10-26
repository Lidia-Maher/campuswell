# CampusWell – Backend

FastAPI + SQLAlchemy + Alembic + PostgreSQL. Authentication is done by Firebase on the frontend; the backend only verifies Firebase ID tokens.

What is ready:

- All 14 tables of the GP2 design as SQLAlchemy models (`app/models/`), one file per module.
- One Alembic migration (`alembic/versions/..._0001_initial_schema.py`) that creates exactly the same database as `database/schema.sql`, including the triggers and the two views.
- Firebase token verification and role checks (`app/auth.py`).
- Endpoints: `/health`, account (`/api/me`), and the mood tracker (`/api/moods`) as the first complete feature.
- 13 automated tests (`tests/`).

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
- Return `404` (not `403`) when a row belongs to someone else.
- Admin/counsellor endpoints use `Depends(require_role("admin"))`.
- Group by day in Amman time (see `_local_day` in `routers/moods.py`).

## 6. Running the tests

Create a second, empty database whose name ends in `_test` (the tests delete all its data):

```bash
TEST_DATABASE_URL=postgresql://user:pass@host/campuswell_test pytest
# Windows PowerShell:
# $env:TEST_DATABASE_URL="postgresql://..."; pytest
```

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

The free plan sleeps after inactivity, so open `/health` a minute before any demo.

## Endpoints so far

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
