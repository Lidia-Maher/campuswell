import { CalendarClock, CheckCircle2, Clock, Flame, Moon, Smile } from "lucide-react";
import { Link } from "react-router";

import { useAssessments, useMoods, useMoodStats, useStudyStats, useTasks } from "../../api/hooks";
import { useCurrentUser } from "../../auth/AuthProvider";
import { MoodLineChart } from "../../components/charts";
import { SupportPanel } from "../../components/SupportPanel";
import { TaskRow } from "../../components/TaskRow";
import { TodaysTip } from "../../components/TodaysTip";
import { Card, Empty, ErrorAlert, Loading, StatCard } from "../../components/ui";
import { addDays, greeting, minutesLabel, shortDate, todayLocal, weekday, whenLabel } from "../../lib/format";
import { moodInfo } from "../../lib/mood";

function useNeedsSupport() {
  const latest = useAssessments(1);
  const a = latest.data?.[0];
  if (!a) return false;
  const recent = Date.now() - new Date(a.taken_at).getTime() < 14 * 24 * 3600 * 1000;
  return recent && a.needs_support_message;
}

export function DashboardPage() {
  const user = useCurrentUser();
  const mood = useMoodStats(7);
  const study = useStudyStats(7);
  const tasks = useTasks();
  const recent = useMoods(3);
  const needsSupport = useNeedsSupport();

  const today = todayLocal();
  const studyToday = study.data?.daily.find((d) => d.day === today)?.focus_minutes ?? 0;
  const openTasks = (tasks.data ?? []).filter((t) => t.status === "pending" || t.status === "in-progress");
  const upcoming = openTasks.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 7));
  const doneWeek = study.data?.tasks_completed ?? 0;

  // all 7 days on the axis, even days without a check-in
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const byDay = new Map((mood.data?.daily ?? []).map((d) => [d.day, d.avg_mood]));

  return (
    <div className="stack-lg">
      <h2 style={{ fontSize: "1.5rem" }}>{greeting()}, {user.name.split(" ")[0]}</h2>

      {needsSupport && <SupportPanel urgent />}

      <div className="grid grid-3">
        <StatCard icon={Flame} label="Check-in streak" tone="amber"
                  value={mood.data ? `${mood.data.streak_days} ${mood.data.streak_days === 1 ? "day" : "days"}` : "–"} />
        <StatCard icon={Clock} label="Study today" value={study.data ? minutesLabel(studyToday) : "–"} />
        <StatCard icon={CheckCircle2} label="Tasks done this week" tone="green"
                  value={study.data ? `${doneWeek}/${doneWeek + study.data.tasks_open}` : "–"} />
      </div>

      <div className="grid grid-main">
        <div className="stack-lg">
          <Card title="Weekly Mood Flow" subtitle="Your emotional trends over the past 7 days"
                action={<Link to="/mood" className="btn btn-secondary"><Smile size={18} aria-hidden /> Quick Log</Link>}
                footer={<><span className="muted">5 happy · 4 neutral · 3 sad · 2 stressed · 1 anxious</span>
                          <Link to="/analytics">Full Analytics →</Link></>}>
            {mood.isPending ? <Loading /> : mood.isError ? <ErrorAlert error={mood.error} /> : (
              <MoodLineChart labels={days.map(weekday)} values={days.map((d) => byDay.get(d) ?? null)}
                             label="Average mood per day over the last 7 days" />
            )}
          </Card>

          <div className="grid grid-half">
            <Card title="Today's Focus" action={<span className="badge badge-blue">{openTasks.length} pending</span>}
                  footer={<Link to="/study">Manage all tasks →</Link>}>
              {tasks.isPending ? <Loading /> : tasks.isError ? <ErrorAlert error={tasks.error} /> :
                openTasks.length === 0 ? <Empty icon={CheckCircle2}>Nothing pending. Add a task in Study Tools.</Empty> : (
                  <ul className="list">{openTasks.slice(0, 4).map((t) => <TaskRow key={t.task_id} task={t} />)}</ul>
                )}
            </Card>
            <Link to="/wellbeing" className="card tint-purple stack" style={{ textDecoration: "none", alignSelf: "end" }}>
              <Moon size={30} aria-hidden />
              <h3>Sleep Sounds</h3>
              <p>Relaxing rain and ocean sounds to help you wind down for deep rest.</p>
            </Link>
          </div>
        </div>

        <div className="stack-lg">
          <TodaysTip />
          <Card title="Upcoming" subtitle="Tasks due in the next 7 days">
            {upcoming.length === 0 ? <p className="muted small">No deadlines this week.</p> : (
              <ul className="list">
                {upcoming.slice(0, 4).map((t) => (
                  <li key={t.task_id} className="list-item">
                    <CalendarClock size={18} color="#2e75b6" aria-hidden />
                    <div className="grow">
                      <strong>{t.title}</strong>
                      <div className="small muted">{t.due_date === today ? "Today" : `${weekday(t.due_date!)} ${shortDate(t.due_date!)}`}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent Moods" footer={<Link to="/mood">View history →</Link>}>
            {recent.isPending ? <Loading /> : recent.data?.length === 0 ? <p className="muted small">No check-ins yet.</p> : (
              <ul className="list">
                {recent.data?.map((m) => {
                  const info = moodInfo(m.mood);
                  return (
                    <li key={m.log_id} className="row" style={{ alignItems: "flex-start" }}>
                      <info.icon size={20} color={info.color} aria-hidden />
                      <div>
                        <strong style={{ color: "#111827" }}>Felt {info.label.toLowerCase()}</strong>
                        <div className="small muted">{whenLabel(m.logged_at)}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
