"""Fill the database with realistic demo data.

    python -m app.seed                  # only works on an empty database
    python -m app.seed --reset          # erases ALL data first, then seeds
    python -m app.seed --content-only   # only the wellness library and tips (for production)

Creates 24 students (8 per department), 1 admin and 1 counsellor, with 30 days of
mood logs, tasks, Pomodoro and wellness sessions, community posts, assessments,
reminders and suggestions. The data is random but repeatable (same result every run).

Every seeded user can be used in /docs with dev mode (AUTH_DEV_MODE=true):
    dev:sara        a student with a check-in every day (good for the mood charts)
    dev:admin       the administrator
    dev:counsellor  the counsellor
The demo data refuses to run when ENVIRONMENT=production; --content-only is allowed there.
"""

import argparse
import random
import sys
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    Assessment,
    AssessmentResponse,
    MoodLog,
    PomodoroSession,
    Post,
    PostLike,
    PostReport,
    Reminder,
    SuggestionTemplate,
    Task,
    User,
    UserSuggestion,
    WellnessContent,
    WellnessSession,
)

DAYS = 30
TZ = ZoneInfo(get_settings().timezone)
rng = random.Random(2026)  # fixed seed: same data on every run

STUDENTS = [
    ("sara", "Sara Haddad"), ("omar", "Omar Khalil"), ("lina", "Lina Nasser"),
    ("yazan", "Yazan Odeh"), ("rania", "Rania Saleh"), ("khaled", "Khaled Mansour"),
    ("dana", "Dana Qasem"), ("hamza", "Hamza Fakhoury"), ("noor", "Noor Hijazi"),
    ("ahmad", "Ahmad Zoubi"), ("leen", "Leen Abbadi"), ("faisal", "Faisal Masri"),
    ("maya", "Maya Shami"), ("zaid", "Zaid Tamimi"), ("tala", "Tala Kurdi"),
    ("kareem", "Kareem Nimri"), ("hala", "Hala Daoud"), ("mohammad", "Mohammad Rawashdeh"),
    ("jana", "Jana Halaseh"), ("laith", "Laith Majali"), ("reem", "Reem Jaber"),
    ("odai", "Odai Smadi"), ("salma", "Salma Atallah"), ("tamer", "Tamer Hourani"),
]
DEPARTMENTS = ["computing", "engineering", "business"]

MOOD_NOTES = {
    5: ["Great lecture today", "Finished my assignment early", "Good day with friends"],
    4: ["Normal day", "A bit tired but fine", "Productive study session"],
    3: ["Missed my morning class", "Feeling a bit low", "Too much reading"],
    2: ["Deadlines piling up", "Worried about the midterm", "Did not sleep well"],
    1: ["Exam tomorrow and not ready", "Very anxious today", "Overwhelmed with projects"],
}
TASK_TITLES = [
    "Data Structures assignment", "Read chapter 5 for Databases", "Prepare lab report",
    "Study for Calculus quiz", "Group project meeting notes", "Revise Operating Systems slides",
    "Write marketing case study", "Circuit analysis homework", "Statistics problem set",
    "Prepare presentation slides", "Review lecture notes", "Finish programming project",
]
POSTS = [
    ("approved", "Good luck to everyone with midterms this week, we can do this!"),
    ("approved", "Tip: the 25-minute Pomodoro timer really helped me focus in the library."),
    ("approved", "Does anyone want to form a study group for Databases?"),
    ("approved", "Remember to take breaks and drink water during exam season."),
    ("approved", "The box breathing exercise calmed me down before my presentation."),
    ("approved", "Feeling stressed is normal, talking to friends helps a lot."),
    ("approved", "Small wins count too. I finished one task today and that is progress."),
    ("approved", "The campus counselling office was really kind when I visited."),
    ("pending", "Is anyone else finding this semester harder than the last?"),
    ("pending", "Looking for tips to sleep better before exams."),
    ("pending", "Thank you to whoever shared the meditation recommendation!"),
    ("rejected", "Selling my old textbooks, message me for prices."),
]
SUGGESTIONS = [
    ("mood", "You have logged lower moods this week. A short walk outside can help."),
    ("study", "You focus best in the morning. Try scheduling hard tasks before noon."),
    ("wellness", "A 5-minute breathing exercise before studying can improve focus."),
    ("rest", "You studied for a long time today. Remember to take a proper break."),
    ("support", "If things feel heavy, the university counselling office is here to help."),
    ("study", "Breaking a big assignment into small tasks makes it easier to start."),
    ("wellness", "Try the body scan meditation tonight to help you sleep."),
    ("rest", "Sleep helps memory. Aim for a regular bedtime during exams."),
]


def local_dt(day: date, hour: int, minute: int = 0) -> datetime:
    """A moment in Amman time, never in the future."""
    moment = datetime.combine(day, time(hour, minute), tzinfo=TZ)
    now = datetime.now(TZ)
    if moment > now:
        moment = now - timedelta(minutes=rng.randint(1, 30))
        if moment.date() != day:  # just after midnight: keep it on the right day
            moment = datetime.combine(day, time(0, 1), tzinfo=TZ)
    return moment


def mood_effect(day: date, today: date) -> float:
    """Lower moods on study days and during the midterm week 8 to 14 days ago."""
    effect = 0.0
    if day.weekday() in (4, 5):  # Friday, Saturday: weekend in Jordan
        effect += 0.4
    if 8 <= (today - day).days <= 14:
        effect -= 0.9
    return effect


def wellness_library(created_by: int | None = None) -> list[WellnessContent]:
    media = "https://media.campuswell.example"  # placeholder until real files are chosen
    return [
        WellnessContent(category="meditation", title="Body scan for sleep", duration_seconds=600,
                        description="Relax each part of the body before bed.",
                        media_url=f"{media}/meditation/body-scan.mp3", created_by=created_by),
        WellnessContent(category="meditation", title="5-minute exam calm", duration_seconds=300,
                        description="A short reset before an exam or presentation.",
                        media_url=f"{media}/meditation/exam-calm.mp3", created_by=created_by),
        WellnessContent(category="meditation", title="Mindful study break", duration_seconds=420,
                        description="Clear your mind between study sessions.",
                        media_url=f"{media}/meditation/study-break.mp3", created_by=created_by),
        WellnessContent(category="breathing", title="Box breathing", duration_seconds=240,
                        description="Inhale, hold, exhale and hold for 4 seconds each.",
                        inhale_seconds=4, hold_seconds=4, exhale_seconds=4, created_by=created_by),
        WellnessContent(category="breathing", title="4-7-8 relaxing breath", duration_seconds=180,
                        description="A slow pattern that helps you wind down.",
                        inhale_seconds=4, hold_seconds=7, exhale_seconds=8, created_by=created_by),
        WellnessContent(category="breathing", title="Calm breathing", duration_seconds=300,
                        description="Even, slow breaths with no hold.",
                        inhale_seconds=5, hold_seconds=0, exhale_seconds=5, created_by=created_by),
        WellnessContent(category="sleep_sounds", title="Rain on the window", duration_seconds=1800,
                        media_url=f"{media}/sleep/rain.mp3", created_by=created_by),
        WellnessContent(category="sleep_sounds", title="Ocean waves", duration_seconds=1800,
                        media_url=f"{media}/sleep/ocean.mp3", created_by=created_by),
    ]


def seed_content(db: Session) -> dict[str, int]:
    """Only the wellness library and the suggestion tips, no users. Safe for production and
    safe to run again: items that already exist (same title / message) are skipped."""
    titles = set(db.scalars(select(WellnessContent.title)))
    messages = set(db.scalars(select(SuggestionTemplate.message)))
    content = [c for c in wellness_library() if c.title not in titles]
    templates = [SuggestionTemplate(category=c, message=m) for c, m in SUGGESTIONS if m not in messages]
    db.add_all(content + templates)
    db.commit()
    return {"wellness_content": len(content), "suggestion_templates": len(templates)}


def seed(db: Session) -> dict[str, int]:
    today = datetime.now(TZ).date()
    days = [today - timedelta(days=d) for d in range(DAYS - 1, -1, -1)]
    consent = local_dt(today - timedelta(days=DAYS + 5), 10)

    # ---- users ----
    admin = User(firebase_uid="dev-admin", email="admin@dev.campuswell.local",
                 name="Admin User", role="admin", consent_accepted_at=consent,
                 onboarding_completed=True)
    counsellor = User(firebase_uid="dev-counsellor", email="counsellor@dev.campuswell.local",
                      name="Dr. Counsellor", role="counsellor", consent_accepted_at=consent,
                      onboarding_completed=True)
    students = [
        User(firebase_uid=f"dev-{key}", email=f"{key}@dev.campuswell.local", name=name,
             department=DEPARTMENTS[i % 3], consent_accepted_at=consent,
             onboarding_completed=True, last_login_at=local_dt(today, 9))
        for i, (key, name) in enumerate(STUDENTS)
    ]
    db.add_all([admin, counsellor, *students])
    db.flush()

    # each student gets a personality: usual mood and how regularly they check in
    profile = {
        s.user_id: (rng.uniform(2.8, 4.2), 1.0 if s.firebase_uid == "dev-sara" else rng.uniform(0.6, 0.95))
        for s in students
    }

    # ---- wellness library ----
    content = wellness_library(created_by=admin.user_id)
    db.add_all(content)
    db.flush()

    moods, tasks, pomodoros, wellness, reminders = [], [], [], [], []
    for s in students:
        baseline, regularity = profile[s.user_id]

        # ---- tasks ----
        my_tasks = []
        for title in rng.sample(TASK_TITLES, rng.randint(4, 8)):
            status = rng.choices(["completed", "pending", "in-progress", "cancelled"], [5, 3, 2, 1])[0]
            due = today + timedelta(days=rng.randint(-10, 14))
            completed_at = None
            if status == "completed":
                completed_day = min(today, due) - timedelta(days=rng.randint(0, 3))
                completed_at = local_dt(completed_day, rng.randint(10, 22))
            task = Task(user_id=s.user_id, title=title, due_date=due, status=status,
                        priority=rng.choice(["low", "medium", "medium", "high"]),
                        completed_at=completed_at,
                        created_at=local_dt(due - timedelta(days=rng.randint(5, 15)), 12))
            my_tasks.append(task)
        tasks.extend(my_tasks)
        db.add_all(my_tasks)
        db.flush()

        for day in days:
            if rng.random() > regularity:
                continue
            # ---- mood ----
            mood = round(baseline + mood_effect(day, today) + rng.gauss(0, 0.7))
            mood = max(1, min(5, mood))
            moods.append(MoodLog(
                user_id=s.user_id, mood=mood,
                note=rng.choice(MOOD_NOTES[mood]) if rng.random() < 0.4 else None,
                is_private=rng.random() < 0.1,
                logged_at=local_dt(day, rng.randint(8, 22), rng.randint(0, 59)),
            ))
            # ---- Pomodoro: better days -> more focus sessions (for correlation analytics) ----
            for _ in range(max(0, round(mood * 0.8 + rng.gauss(-1.5, 1)))):
                cancelled = rng.random() < 0.1
                minutes = rng.randint(5, 20) if cancelled else 25
                end = local_dt(day, rng.randint(9, 23), rng.randint(0, 59))
                pomodoros.append(PomodoroSession(
                    user_id=s.user_id, task_id=rng.choice(my_tasks).task_id,
                    planned_minutes=25, duration_minutes=minutes,
                    status="cancelled" if cancelled else "completed",
                    started_at=end - timedelta(minutes=minutes), completed_at=end,
                ))

        # ---- wellness sessions ----
        for _ in range(rng.randint(3, 12)):
            item = rng.choice(content)
            finished = rng.random() < 0.85
            seconds = item.duration_seconds if finished else rng.randint(30, item.duration_seconds - 1)
            end = local_dt(rng.choice(days), rng.randint(7, 23), rng.randint(0, 59))
            wellness.append(WellnessSession(
                user_id=s.user_id, content_id=item.content_id, duration_seconds=seconds,
                is_completed=finished, started_at=end - timedelta(seconds=seconds), ended_at=end,
            ))

        # ---- reminders ----
        reminders.append(Reminder(user_id=s.user_id, reminder_type="mood_checkin", remind_at=time(20, 0)))
        if rng.random() < 0.5:
            reminders.append(Reminder(user_id=s.user_id, reminder_type="study", remind_at=time(17, 30)))

    db.add_all(moods + pomodoros + wellness + reminders)

    # ---- community ----
    posts = []
    for i, (status, body) in enumerate(POSTS):
        created = local_dt(today - timedelta(days=DAYS - 2 - i * 2), rng.randint(9, 21))
        reviewed = status != "pending"
        posts.append(Post(
            user_id=students[i % len(students)].user_id, content=body, status=status, created_at=created,
            reviewed_by=admin.user_id if reviewed else None,
            reviewed_at=created + timedelta(hours=rng.randint(1, 6)) if reviewed else None,
            rejection_reason="Advertising is not allowed on the support board" if status == "rejected" else None,
        ))
    db.add_all(posts)
    db.flush()

    likes = []
    for post in posts:
        if post.status == "approved":
            for liker in rng.sample(students, rng.randint(2, 10)):
                if liker.user_id != post.user_id:
                    likes.append(PostLike(post_id=post.post_id, user_id=liker.user_id))
    reports = [
        PostReport(post_id=posts[2].post_id, reporter_id=students[10].user_id,
                   reason="Not sure this belongs here"),
        PostReport(post_id=posts[0].post_id, reporter_id=students[11].user_id, reason="Spam",
                   status="dismissed", reviewed_by=admin.user_id, reviewed_at=local_dt(today, 9)),
    ]
    db.add_all(likes + reports)

    # ---- assessments (PHQ-9 and GAD-7, two weeks apart) ----
    assessments = []
    flagged = "dev-noor"  # exactly one example of the PHQ-9 question 9 safety flag
    for s in students[:16]:
        baseline, _ = profile[s.user_id]
        for weeks_ago in (3, 1):
            for kind, items in (("PHQ9", 9), ("GAD7", 7)):
                a = Assessment(user_id=s.user_id, assessment_type=kind,
                               taken_at=local_dt(today - timedelta(weeks=weeks_ago), 19))
                # lower usual mood -> higher scores (0..3 per question)
                level = (4.2 - baseline) * 0.9 + (0.4 if weeks_ago == 1 else 0)
                for n in range(1, items + 1):
                    score = max(0, min(3, round(level + rng.gauss(0, 0.6))))
                    if kind == "PHQ9" and n == 9:
                        score = 1 if (s.firebase_uid == flagged and weeks_ago == 1) else 0
                    a.responses.append(AssessmentResponse(assessment_type=kind, item_number=n, score=score))
                assessments.append(a)
    db.add_all(assessments)

    # ---- suggestions ----
    templates = [SuggestionTemplate(category=c, message=m) for c, m in SUGGESTIONS]
    db.add_all(templates)
    db.flush()
    shown = [
        UserSuggestion(user_id=s.user_id, template_id=rng.choice(templates).template_id,
                       model_version="rules-v1", was_helpful=rng.choice([True, True, False, None]),
                       shown_at=local_dt(rng.choice(days), 20))
        for s in students for _ in range(rng.randint(0, 3))
    ]
    db.add_all(shown)
    db.commit()

    return {
        "users": len(students) + 2, "mood_logs": len(moods), "tasks": len(tasks),
        "pomodoro_sessions": len(pomodoros), "wellness_content": len(content),
        "wellness_sessions": len(wellness), "posts": len(posts), "post_likes": len(likes),
        "post_reports": len(reports), "assessments": len(assessments),
        "reminders": len(reminders), "suggestion_templates": len(templates),
        "user_suggestions": len(shown),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill the database with demo data")
    parser.add_argument("--reset", action="store_true", help="erase ALL existing data first")
    parser.add_argument("--content-only", action="store_true",
                        help="only add the wellness library and tips (no users; allowed in production)")
    args = parser.parse_args()

    if args.content_only:
        if args.reset:
            sys.exit("--content-only cannot be combined with --reset")
        with SessionLocal() as db:
            counts = seed_content(db)
        print("Added (existing items skipped):")
        for table, count in counts.items():
            print(f"  {table:<22}{count:>6}")
        return

    if get_settings().environment == "production":
        sys.exit("Refusing to seed: ENVIRONMENT=production")

    with SessionLocal() as db:
        if args.reset:
            db.execute(text(
                "TRUNCATE users, wellness_content, suggestion_templates RESTART IDENTITY CASCADE"
            ))
            db.commit()
        elif db.scalar(select(func.count()).select_from(User)):
            sys.exit("The database already has data. Run with --reset to erase it and seed again.")

        counts = seed(db)

    print("Seeded the database:")
    for table, count in counts.items():
        print(f"  {table:<22}{count:>6}")
    print("\nTry it in /docs with dev mode: dev:sara, dev:admin or dev:counsellor")


if __name__ == "__main__":
    main()
