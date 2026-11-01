# CampusWell – GP2 Database Design Notes

Deliverables in this folder:

- `schema.sql` – complete PostgreSQL schema (14 tables, 2 views). Tested on PostgreSQL 16, including the constraints, the views, and cascade deletion.
- `erd.mermaid` / `erd.png` – ERD generated from the same design (the `.mermaid` file renders directly on GitHub and can be edited at mermaid.live).
- This note – review findings (A1), changes (A2), assumptions and open decisions (A3).

## A1. Review of the GP1 design

The GP1 schema (Report Table 4.19) had five tables: `users`, `mood_logs`, `tasks`, `posts`, `sessions`. Compared with the functional requirements, UML diagrams and UI screens in the same report, the following were missing or inconsistent.

| # | Finding | Source in GP1 report |
|---|---------|----------------------|
| 1 | No table for PHQ-9 / GAD-7 results | FR-12 (Essential) |
| 2 | No wellness library or record of meditation / breathing sessions | FR-06, FR-07; Well-Being screen says sessions are saved to the database |
| 3 | No user roles – admin and counsellor cannot be distinguished from students | Stakeholders 3.1; Use case diagrams 4.8, 4.9 |
| 4 | No department on users – counsellor reports filter by department | Reports design Table 4.21 |
| 5 | Posts have no moderation status, although admins approve/reject posts | Object diagram 4.5; Sequence diagram 4.16 |
| 6 | No likes or reports, although the Community screen has like and report buttons | Table 4.20 |
| 7 | Tasks have no priority, although FR-05 takes priority as input | FR-05 |
| 8 | Task states `cancelled` (state diagram) is not allowed by the CHECK; no completion time, so task completion rates by day cannot be computed | Figure 4.20; Analytics 4.1.4.1 |
| 9 | Pomodoro sessions cannot be cancelled or linked to a task | Figure 4.19; Object diagram 4.4 |
| 10 | Mood stored as text, but analytics and the Mood Tracker UI use numbers | Section 4.1.4.1; Mood Tracker description |
| 11 | No privacy flag on mood logs, although the UI has a privacy switch | Mood Tracker description |
| 12 | No notification / reminder settings | FR-10; Settings screen |
| 13 | No consent record, although consent is collected at registration | Table 3.16; Section 3.6 |
| 14 | No storage for AI suggestions or their templates | FR-11 (Optional) |
| 15 | `TIMESTAMP` without time zone makes day-of-week analytics unreliable | Section 4.1.4.1 |

## A2. Changes made

**Existing tables (kept, extended – no duplicates created):**

- `users`: added `role`, `department`, `is_active` (admin can deactivate accounts), `onboarding_completed` (onboarding tutorial, usability NFR), `consent_accepted_at`, `last_login_at`, `updated_at`. A student must have a department.
- `mood_logs`: `mood` changed from VARCHAR to SMALLINT 1–5 (5 happy, 4 neutral, 3 sad, 2 stressed, 1 anxious – same mapping as Section 4.1.4.1). Added `is_private`. Note length capped at 2000 characters.
- `tasks`: added `description`, `priority`, `completed_at`, `created_at`, `updated_at`; added `cancelled` status. A constraint ensures `completed_at` is filled exactly when the status is `completed`.
- `sessions` → **renamed `pomodoro_sessions`**, because there are now two kinds of session (Pomodoro and wellness) and "session" is also used for login sessions. Added `task_id` (optional), `planned_minutes`, `status`, `started_at`.
- `posts`: added `status`, `reviewed_by`, `reviewed_at`, `rejection_reason`. New posts start as `pending`.

**New tables:** `wellness_content`, `wellness_sessions`, `post_likes`, `post_reports`, `assessments`, `assessment_responses`, `reminders`, `suggestion_templates`, `user_suggestions` (the last two only for the optional AI feature).

**New views (derived data, not stored):**

- `v_assessment_results` – total score, severity band, and `needs_support_message` (true when PHQ-9 question 9 is answered above 0).
- `v_campus_daily_mood` – anonymized mood per department per day for counsellors. No user IDs, private entries excluded, and any group with fewer than 5 students is hidden.

**Normalization.** All tables are in 3NF. Totals, severity, streaks and "overdue" are computed, not stored. One deliberate exception: `assessment_responses.assessment_type` repeats the parent's type so the database can check the item number (1–9 for PHQ-9, 1–7 for GAD-7). A composite foreign key guarantees it always matches the parent, so it cannot become inconsistent. Similarly, `tasks` stores both `status` and `completed_at`, which overlap (a completed task always has a completion time); a check constraint keeps them consistent, and both are needed: `status` drives the task list, and `completed_at` gives the exact time for the task-completion analytics.

**Indexes.** Every foreign key is indexed, plus composite indexes for the most frequent queries: a user's data by date (mood, sessions, assessments), tasks by status and due date, the post feed by status and date, and open reports.

**Deletion.** Deleting a user removes all their personal data (account deletion requirement, Section 3.6). Admin references (`reviewed_by`, `created_by`) become NULL instead of blocking deletion. Wellness content and suggestion templates cannot be deleted while used; they are deactivated with `is_active` instead.

## A3. Assumptions and open decisions

**Assumptions (please confirm or correct):**

1. Authentication is fully handled by Firebase, so no passwords or tokens are stored. `firebase_uid` links the two.
2. Departments are the three target schools: computing, engineering, business. Admins and counsellors may have no department.
3. One role per user.
4. A student can log mood more than once a day; daily analytics use the average for that day.
5. `is_private` on a mood log means the entry is excluded from the anonymized counsellor statistics.
6. Rows for Pomodoro and wellness sessions are written when a session ends (completed or cancelled), not while running.
7. Every new post needs admin approval before it appears in the feed.
8. Assessment answers are stored item by item, so the total is always recalculated from the answers. The API must save all items of one assessment in a single transaction.
9. PHQ-9 uses five severity bands (including "moderately severe" for 15–19), following the standard scoring; GAD-7 uses four. FR-12 in the GP1 report lists only four bands.

**Open decisions:**

1. **Encryption of sensitive fields.** The NFRs require AES-256 at rest. Hosted PostgreSQL (Neon / Supabase) already encrypts the disk. Should mood notes additionally be encrypted by the backend before saving? This changes how `note` is stored and means notes cannot be searched.
2. **Anonymous community posts.** Should students be able to post without showing their name? This would need an `is_anonymous` flag on `posts`.
3. **Admin audit log.** Should admin actions (deactivating users, editing content) be recorded? Not in the requirements, so not included.
4. **AI tables.** `suggestion_templates` and `user_suggestions` support FR-11 (Optional). They can be left unused if the AI feature is dropped.
5. **Minimum group size of 5** in the counsellor view – confirm the value with the supervisor.
6. **SERIAL keys** are kept for consistency with the GP1 report; `GENERATED ... AS IDENTITY` is the newer PostgreSQL equivalent if preferred.
7. **"Recommend counselling" cut-off.** Besides the PHQ-9 question 9 flag, the API returns `recommend_counselling` for results of 15 or more (PHQ-9 moderately severe / severe, GAD-7 severe). Some services use 10 (moderate). Set in `RECOMMEND_COUNSELLING` in `backend/app/schemas/assessment.py`; confirm with the supervisor.
8. **Author names in the community feed.** The feed currently shows the author's name. If anonymous posting is chosen (decision 2), the API will hide it for anonymous posts.
9. **Severity summary for counsellors.** Counsellors see how many students per department fall in each severity band (groups of 5 or more only). The number of PHQ-9 question 9 flags is deliberately *not* shown; confirm whether counsellors should see it.

## How to run

```bash
psql "<database connection string>" -f schema.sql
```

The script runs in one transaction, so it either creates everything or nothing. In GP2 the backend will manage the same schema through Alembic migrations.
