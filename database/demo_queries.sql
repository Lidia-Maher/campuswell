-- =====================================================================
-- CampusWell – database demo queries
-- Run in Neon's SQL Editor (campuswell database) after: python -m app.seed --reset
-- Run each numbered block on its own: select it, then click Run.
-- =====================================================================

-- 1. Every table and how many rows the seed data created
SELECT 'users' AS table_name, COUNT(*) AS rows FROM users
UNION ALL SELECT 'mood_logs', COUNT(*) FROM mood_logs
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks
UNION ALL SELECT 'pomodoro_sessions', COUNT(*) FROM pomodoro_sessions
UNION ALL SELECT 'wellness_content', COUNT(*) FROM wellness_content
UNION ALL SELECT 'wellness_sessions', COUNT(*) FROM wellness_sessions
UNION ALL SELECT 'posts', COUNT(*) FROM posts
UNION ALL SELECT 'post_likes', COUNT(*) FROM post_likes
UNION ALL SELECT 'post_reports', COUNT(*) FROM post_reports
UNION ALL SELECT 'assessments', COUNT(*) FROM assessments
UNION ALL SELECT 'assessment_responses', COUNT(*) FROM assessment_responses
UNION ALL SELECT 'reminders', COUNT(*) FROM reminders
UNION ALL SELECT 'suggestion_templates', COUNT(*) FROM suggestion_templates
UNION ALL SELECT 'user_suggestions', COUNT(*) FROM user_suggestions;


-- 2. Counsellor view (FR-09, Table 4.21): anonymized mood per department per day.
--    No names or ids; private entries excluded; days with fewer than 5 students hidden.
SELECT * FROM v_campus_daily_mood
ORDER BY day DESC, department
LIMIT 15;


-- 3. PHQ-9 / GAD-7 results (FR-12): score and severity are calculated from the
--    answers, not stored. needs_support_message is true when PHQ-9 question 9 > 0.
SELECT u.name, r.assessment_type, r.total_score, r.severity,
       r.needs_support_message, r.taken_at::date AS taken_on
FROM v_assessment_results r
JOIN users u USING (user_id)
ORDER BY r.needs_support_message DESC, r.total_score DESC
LIMIT 10;


-- 4. Analytics (FR-09): does mood go up on days with more focused study?
--    Pearson correlation between daily mood and daily Pomodoro minutes.
WITH daily_mood AS (
    SELECT user_id, (logged_at AT TIME ZONE 'Asia/Amman')::date AS day, AVG(mood) AS mood
    FROM mood_logs GROUP BY 1, 2
), daily_focus AS (
    SELECT user_id, (completed_at AT TIME ZONE 'Asia/Amman')::date AS day,
           SUM(duration_minutes) AS focus_minutes
    FROM pomodoro_sessions WHERE status = 'completed' GROUP BY 1, 2
)
SELECT ROUND(CORR(m.mood, COALESCE(f.focus_minutes, 0))::numeric, 2) AS mood_focus_correlation,
       COUNT(*) AS student_days
FROM daily_mood m
LEFT JOIN daily_focus f USING (user_id, day);


-- 5. Mood by day of the week (FR-09): Friday and Saturday are the weekend in Jordan
SELECT TO_CHAR(logged_at AT TIME ZONE 'Asia/Amman', 'Day') AS weekday,
       ROUND(AVG(mood), 2) AS average_mood,
       COUNT(*) AS logs
FROM mood_logs
GROUP BY 1, EXTRACT(ISODOW FROM logged_at AT TIME ZONE 'Asia/Amman')
ORDER BY EXTRACT(ISODOW FROM logged_at AT TIME ZONE 'Asia/Amman');


-- 6. Community moderation (FR-08): posts by status, with likes and open reports
SELECT p.status,
       COUNT(*) AS posts,
       SUM((SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id)) AS likes,
       SUM((SELECT COUNT(*) FROM post_reports r
            WHERE r.post_id = p.post_id AND r.status = 'open')) AS open_reports
FROM posts p
GROUP BY p.status;


-- 7. The database rejects invalid data. Run each line ON ITS OWN; each one
--    should fail with a "violates check constraint" or "foreign key" error.

-- 7a. mood outside 1–5
INSERT INTO mood_logs (user_id, mood) VALUES (1, 7);

-- 7b. a post marked approved without a review time
INSERT INTO posts (user_id, content, status) VALUES (1, 'test', 'approved');

-- 7c. a GAD-7 has only 7 questions
INSERT INTO assessment_responses (assessment_id, assessment_type, item_number, score)
SELECT assessment_id, 'GAD7', 8, 1 FROM assessments WHERE assessment_type = 'GAD7' LIMIT 1;

-- 7d. an answer claiming a different questionnaire than its assessment
--     (creates a PHQ-9 and gives it a GAD-7 answer; the whole statement is rejected)
WITH a AS (
    INSERT INTO assessments (user_id, assessment_type) VALUES (1, 'PHQ9') RETURNING assessment_id
)
INSERT INTO assessment_responses (assessment_id, assessment_type, item_number, score)
SELECT assessment_id, 'GAD7', 1, 1 FROM a;


-- 8. Account deletion (privacy requirement): deleting a user removes all of their
--    data automatically. Wrapped in a transaction and rolled back, so nothing is lost.
BEGIN;
CREATE TEMP TABLE demo_user AS
    SELECT user_id FROM users WHERE email = 'tamer@dev.campuswell.local';

SELECT 'before delete' AS moment,
       (SELECT COUNT(*) FROM mood_logs WHERE user_id IN (SELECT user_id FROM demo_user)) AS moods,
       (SELECT COUNT(*) FROM tasks WHERE user_id IN (SELECT user_id FROM demo_user)) AS tasks,
       (SELECT COUNT(*) FROM pomodoro_sessions WHERE user_id IN (SELECT user_id FROM demo_user)) AS focus_sessions;

DELETE FROM users WHERE user_id IN (SELECT user_id FROM demo_user);

SELECT 'after delete' AS moment,
       (SELECT COUNT(*) FROM mood_logs WHERE user_id IN (SELECT user_id FROM demo_user)) AS moods,
       (SELECT COUNT(*) FROM tasks WHERE user_id IN (SELECT user_id FROM demo_user)) AS tasks,
       (SELECT COUNT(*) FROM pomodoro_sessions WHERE user_id IN (SELECT user_id FROM demo_user)) AS focus_sessions;
ROLLBACK;
