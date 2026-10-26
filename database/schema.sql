-- =====================================================================
-- CampusWell – GP2 Database Schema (PostgreSQL 15+)
-- Revision of the GP1 schema (Table 4.19). See DESIGN_NOTES.md for the
-- review, the list of changes, assumptions, and open decisions.
--
-- Conventions
--   * snake_case, plural table names
--   * SERIAL primary keys (same as GP1)
--   * TIMESTAMPTZ for all timestamps (correct day-of-week analytics in Asia/Amman)
--   * Derived values (totals, severity, streaks, overdue) are NOT stored;
--     they are computed in views or queries (3NF)
--   * Deleting a user deletes all of their personal data (ON DELETE CASCADE)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Helper: keep updated_at current
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 1. users                                         (FR-01, stakeholders)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id               SERIAL PRIMARY KEY,
    firebase_uid          VARCHAR(128) NOT NULL UNIQUE,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    name                  VARCHAR(100) NOT NULL,
    role                  VARCHAR(20)  NOT NULL DEFAULT 'student'
                          CHECK (role IN ('student', 'admin', 'counsellor')),
    department            VARCHAR(20)
                          CHECK (department IN ('computing', 'engineering', 'business')),
    is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
    onboarding_completed  BOOLEAN      NOT NULL DEFAULT FALSE,
    consent_accepted_at   TIMESTAMPTZ  NOT NULL,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- every student must belong to a department (needed for counsellor filters)
    CONSTRAINT chk_student_department
        CHECK (role <> 'student' OR department IS NOT NULL)
);

CREATE INDEX idx_users_role_department ON users (role, department);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 2. mood_logs                                           (FR-02, FR-03)
-- ---------------------------------------------------------------------
CREATE TABLE mood_logs (
    log_id      SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    -- 5 = happy, 4 = neutral, 3 = sad, 2 = stressed, 1 = anxious
    mood        SMALLINT    NOT NULL CHECK (mood BETWEEN 1 AND 5),
    note        TEXT        CHECK (char_length(note) <= 2000),
    is_private  BOOLEAN     NOT NULL DEFAULT FALSE,
    logged_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mood_logs_user_time ON mood_logs (user_id, logged_at);

-- ---------------------------------------------------------------------
-- 3. tasks                                                       (FR-05)
-- ---------------------------------------------------------------------
CREATE TABLE tasks (
    task_id       SERIAL PRIMARY KEY,
    user_id       INTEGER      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    title         VARCHAR(255) NOT NULL,
    description   TEXT,
    priority      VARCHAR(10)  NOT NULL DEFAULT 'medium'
                  CHECK (priority IN ('low', 'medium', 'high')),
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
    due_date      DATE,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- completed_at is set exactly when the task is completed
    CONSTRAINT chk_task_completed_at
        CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_tasks_user_status ON tasks (user_id, status);
CREATE INDEX idx_tasks_user_due    ON tasks (user_id, due_date);

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 4. pomodoro_sessions      (FR-04; was "sessions" in GP1, renamed)
-- ---------------------------------------------------------------------
CREATE TABLE pomodoro_sessions (
    session_id        SERIAL PRIMARY KEY,
    user_id           INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    task_id           INTEGER     REFERENCES tasks (task_id) ON DELETE SET NULL,
    planned_minutes   SMALLINT    NOT NULL CHECK (planned_minutes BETWEEN 1 AND 180),
    duration_minutes  SMALLINT    NOT NULL CHECK (duration_minutes BETWEEN 0 AND 180),
    status            VARCHAR(20) NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('completed', 'cancelled')),
    started_at        TIMESTAMPTZ NOT NULL,
    completed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_pomodoro_times CHECK (completed_at >= started_at)
);

CREATE INDEX idx_pomodoro_user_time ON pomodoro_sessions (user_id, completed_at);
CREATE INDEX idx_pomodoro_task      ON pomodoro_sessions (task_id);

-- ---------------------------------------------------------------------
-- 5. wellness_content                                     (FR-06, FR-07)
--    Library of meditations, breathing exercises, sleep sounds (admin-managed)
-- ---------------------------------------------------------------------
CREATE TABLE wellness_content (
    content_id        SERIAL PRIMARY KEY,
    category          VARCHAR(20)  NOT NULL
                      CHECK (category IN ('meditation', 'breathing', 'sleep_sounds')),
    title             VARCHAR(150) NOT NULL,
    description       TEXT,
    duration_seconds  INTEGER      NOT NULL CHECK (duration_seconds > 0),
    media_url         VARCHAR(500),
    thumbnail_url     VARCHAR(500),
    -- breathing pattern (breathing exercises only)
    inhale_seconds    SMALLINT CHECK (inhale_seconds > 0),
    hold_seconds      SMALLINT CHECK (hold_seconds >= 0),
    exhale_seconds    SMALLINT CHECK (exhale_seconds > 0),
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by        INTEGER      REFERENCES users (user_id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_breathing_pattern CHECK (
        (category = 'breathing'
            AND inhale_seconds IS NOT NULL AND exhale_seconds IS NOT NULL)
        OR (category <> 'breathing'
            AND inhale_seconds IS NULL AND hold_seconds IS NULL AND exhale_seconds IS NULL)
    ),
    -- breathing exercises are guided on screen; the others need media
    CONSTRAINT chk_media_required CHECK (category = 'breathing' OR media_url IS NOT NULL)
);

CREATE INDEX idx_wellness_content_category ON wellness_content (category) WHERE is_active;
CREATE INDEX idx_wellness_content_created_by ON wellness_content (created_by);

-- ---------------------------------------------------------------------
-- 6. wellness_sessions                                    (FR-06, FR-07)
--    One row per meditation / breathing session a student finishes or stops
-- ---------------------------------------------------------------------
CREATE TABLE wellness_sessions (
    session_id        SERIAL PRIMARY KEY,
    user_id           INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    content_id        INTEGER     NOT NULL REFERENCES wellness_content (content_id) ON DELETE RESTRICT,
    duration_seconds  INTEGER     NOT NULL CHECK (duration_seconds >= 0),
    is_completed      BOOLEAN     NOT NULL DEFAULT TRUE,
    started_at        TIMESTAMPTZ NOT NULL,
    ended_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_wellness_times CHECK (ended_at >= started_at)
);

CREATE INDEX idx_wellness_sessions_user_time ON wellness_sessions (user_id, ended_at);
CREATE INDEX idx_wellness_sessions_content   ON wellness_sessions (content_id);

-- ---------------------------------------------------------------------
-- 7. posts                                         (FR-08 + moderation)
-- ---------------------------------------------------------------------
CREATE TABLE posts (
    post_id           SERIAL PRIMARY KEY,
    user_id           INTEGER      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    content           VARCHAR(500) NOT NULL CHECK (char_length(trim(content)) > 0),
    status            VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by       INTEGER      REFERENCES users (user_id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    rejection_reason  VARCHAR(255),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_post_review CHECK (
        (status = 'pending' AND reviewed_at IS NULL)
        OR (status <> 'pending' AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX idx_posts_status_time ON posts (status, created_at DESC);
CREATE INDEX idx_posts_user        ON posts (user_id);
CREATE INDEX idx_posts_reviewed_by ON posts (reviewed_by);

-- ---------------------------------------------------------------------
-- 8. post_likes                                (FR-08, "like" button)
-- ---------------------------------------------------------------------
CREATE TABLE post_likes (
    post_id     INTEGER     NOT NULL REFERENCES posts (post_id) ON DELETE CASCADE,
    user_id     INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)          -- one like per user per post
);

CREATE INDEX idx_post_likes_user ON post_likes (user_id);

-- ---------------------------------------------------------------------
-- 9. post_reports                            (FR-08, "report" button)
-- ---------------------------------------------------------------------
CREATE TABLE post_reports (
    report_id    SERIAL PRIMARY KEY,
    post_id      INTEGER      NOT NULL REFERENCES posts (post_id) ON DELETE CASCADE,
    reporter_id  INTEGER      NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    reason       VARCHAR(255) NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'action_taken', 'dismissed')),
    reviewed_by  INTEGER      REFERENCES users (user_id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_report_once UNIQUE (post_id, reporter_id)
);

CREATE INDEX idx_post_reports_open     ON post_reports (created_at) WHERE status = 'open';
CREATE INDEX idx_post_reports_reporter ON post_reports (reporter_id);
CREATE INDEX idx_post_reports_reviewer ON post_reports (reviewed_by);

-- ---------------------------------------------------------------------
-- 10. assessments                                                (FR-12)
-- ---------------------------------------------------------------------
CREATE TABLE assessments (
    assessment_id    SERIAL PRIMARY KEY,
    user_id          INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    assessment_type  VARCHAR(10) NOT NULL CHECK (assessment_type IN ('PHQ9', 'GAD7')),
    taken_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_assessment_type UNIQUE (assessment_id, assessment_type)
);

CREATE INDEX idx_assessments_user_time ON assessments (user_id, taken_at);

-- ---------------------------------------------------------------------
-- 11. assessment_responses                                       (FR-12)
--     One row per question answer (0 = not at all ... 3 = nearly every day).
--     assessment_type is repeated only so the item range can be checked;
--     the composite FK guarantees it always matches the parent row.
-- ---------------------------------------------------------------------
CREATE TABLE assessment_responses (
    assessment_id    INTEGER     NOT NULL,
    assessment_type  VARCHAR(10) NOT NULL,
    item_number      SMALLINT    NOT NULL,
    score            SMALLINT    NOT NULL CHECK (score BETWEEN 0 AND 3),
    PRIMARY KEY (assessment_id, item_number),
    FOREIGN KEY (assessment_id, assessment_type)
        REFERENCES assessments (assessment_id, assessment_type) ON DELETE CASCADE,
    CONSTRAINT chk_item_range CHECK (
        (assessment_type = 'PHQ9' AND item_number BETWEEN 1 AND 9)
        OR (assessment_type = 'GAD7' AND item_number BETWEEN 1 AND 7)
    )
);

-- ---------------------------------------------------------------------
-- 12. reminders                                                  (FR-10)
--     One row per reminder type per user (settings toggles)
-- ---------------------------------------------------------------------
CREATE TABLE reminders (
    reminder_id    SERIAL PRIMARY KEY,
    user_id        INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    reminder_type  VARCHAR(20) NOT NULL
                   CHECK (reminder_type IN ('mood_checkin', 'study', 'wellness')),
    remind_at      TIME        NOT NULL,
    is_enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_reminder_per_type UNIQUE (user_id, reminder_type)
);

CREATE TRIGGER trg_reminders_updated_at
    BEFORE UPDATE ON reminders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 13. suggestion_templates                         (FR-11, optional)
--     Predefined, low-risk, non-clinical wellness tips
-- ---------------------------------------------------------------------
CREATE TABLE suggestion_templates (
    template_id  SERIAL PRIMARY KEY,
    category     VARCHAR(20)  NOT NULL
                 CHECK (category IN ('mood', 'study', 'wellness', 'rest', 'support')),
    message      VARCHAR(500) NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 14. user_suggestions                             (FR-11, optional)
--     Which template was shown to which user, and their feedback
-- ---------------------------------------------------------------------
CREATE TABLE user_suggestions (
    suggestion_id  SERIAL PRIMARY KEY,
    user_id        INTEGER     NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    template_id    INTEGER     NOT NULL REFERENCES suggestion_templates (template_id) ON DELETE RESTRICT,
    model_version  VARCHAR(50),
    was_helpful    BOOLEAN,
    shown_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_suggestions_user_time ON user_suggestions (user_id, shown_at);
CREATE INDEX idx_user_suggestions_template  ON user_suggestions (template_id);

-- =====================================================================
-- VIEWS (derived data – not stored, so the tables stay in 3NF)
-- =====================================================================

-- Assessment totals, severity bands, and the PHQ-9 item 9 safety flag
CREATE VIEW v_assessment_results AS
SELECT
    a.assessment_id,
    a.user_id,
    a.assessment_type,
    a.taken_at,
    SUM(r.score)::INT AS total_score,
    COUNT(r.item_number)::INT AS items_answered,
    CASE
        WHEN SUM(r.score) <= 4  THEN 'minimal'
        WHEN SUM(r.score) <= 9  THEN 'mild'
        WHEN SUM(r.score) <= 14 THEN 'moderate'
        WHEN a.assessment_type = 'PHQ9' AND SUM(r.score) <= 19 THEN 'moderately_severe'
        ELSE 'severe'
    END AS severity,
    -- PHQ-9 question 9 (thoughts of self-harm): any answer above 0 must show
    -- the support / counselling message, regardless of total score
    COALESCE(BOOL_OR(a.assessment_type = 'PHQ9' AND r.item_number = 9 AND r.score > 0), FALSE)
        AS needs_support_message
FROM assessments a
JOIN assessment_responses r ON r.assessment_id = a.assessment_id
GROUP BY a.assessment_id, a.user_id, a.assessment_type, a.taken_at;

-- Anonymized campus mood trends for counsellors (Table 4.21 report).
-- No user ids; private entries excluded; groups with fewer than 5
-- students are hidden so individuals cannot be identified.
CREATE VIEW v_campus_daily_mood AS
SELECT
    u.department,
    (m.logged_at AT TIME ZONE 'Asia/Amman')::DATE AS day,
    COUNT(DISTINCT m.user_id)::INT                AS students,
    ROUND(AVG(m.mood), 2)                         AS avg_mood,
    COUNT(*) FILTER (WHERE m.mood <= 2)::INT      AS stressed_or_anxious_logs,
    COUNT(*)::INT                                 AS total_logs
FROM mood_logs m
JOIN users u ON u.user_id = m.user_id
WHERE u.role = 'student'
  AND NOT m.is_private
GROUP BY u.department, (m.logged_at AT TIME ZONE 'Asia/Amman')::DATE
HAVING COUNT(DISTINCT m.user_id) >= 5;

COMMIT;
