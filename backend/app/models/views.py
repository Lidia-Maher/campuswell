"""Read-only access to the two database views (created in the first migration).
These are plain table() constructs, not models, so Alembic does not try to create them."""

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, column, table

v_assessment_results = table(
    "v_assessment_results",
    column("assessment_id", Integer),
    column("user_id", Integer),
    column("assessment_type", String),
    column("taken_at", DateTime(timezone=True)),
    column("total_score", Integer),
    column("items_answered", Integer),
    column("severity", String),
    column("needs_support_message", Boolean),
)

v_campus_daily_mood = table(
    "v_campus_daily_mood",
    column("department", String),
    column("day", Date),
    column("students", Integer),
    column("avg_mood", Numeric),
    column("stressed_or_anxious_logs", Integer),
    column("total_logs", Integer),
)
