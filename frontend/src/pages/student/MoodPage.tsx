import { CalendarDays, Download, Lock, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { type Mood, useDeleteMood, useLogMood, useMoods, useMoodStats } from "../../api/hooks";
import { useCurrentUser } from "../../auth/AuthProvider";
import { MoodLineChart } from "../../components/charts";
import { Alert, Button, Card, ConfirmDialog, Empty, ErrorAlert, Loading, Switch, Tabs, TextArea } from "../../components/ui";
import { downloadFile, toCsv } from "../../lib/download";
import { addDays, localDate, shortDate, todayLocal, todayLong, whenLabel } from "../../lib/format";
import { type MoodValue, MOODS, moodInfo } from "../../lib/mood";

function MoodForm() {
  const user = useCurrentUser();
  const log = useLogMood();
  const [mood, setMood] = useState<MoodValue | null>(null);
  const [note, setNote] = useState("");
  const [isPrivate, setPrivate] = useState(false);
  const [saved, setSaved] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!mood) return;
    log.mutate({ mood, note: note.trim() || null, is_private: isPrivate }, {
      onSuccess: () => {
        setSaved(`Logged: ${moodInfo(mood).label}. Thanks for checking in.`);
        setMood(null);
        setNote("");
        setPrivate(false);
      },
    });
  }

  return (
    <form onSubmit={submit} className="card" aria-labelledby="mood-question">
      <div className="row spread" style={{ marginBottom: 18 }}>
        <div>
          <h2 id="mood-question" style={{ fontSize: "1.5rem" }}>How are you feeling, {user.name.split(" ")[0]}?</h2>
          <p className="muted">Logging your mood regularly helps identify patterns in your well-being.</p>
        </div>
        <span className="badge"><CalendarDays size={14} aria-hidden /> {todayLong()}</span>
      </div>
      <div className="grid grid-main">
        <div role="radiogroup" aria-labelledby="mood-question" className="row wrap" style={{ gap: 12, alignItems: "stretch", alignSelf: "start" }}>
          {MOODS.map((m) => {
            const selected = mood === m.value;
            return (
              <button key={m.value} type="button" role="radio" aria-checked={selected} onClick={() => setMood(m.value)}
                      style={{
                        flex: "1 1 90px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                        padding: "18px 8px", borderRadius: 12, cursor: "pointer", font: "inherit", fontWeight: 600,
                        border: `2px solid ${selected ? m.color : "#e5e9f0"}`,
                        background: selected ? `${m.color}14` : "#fff", color: selected ? m.color : "#374151",
                      }}>
                <m.icon size={36} color={m.color} aria-hidden />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className="stack">
          <TextArea label="What's on your mind? (optional)" value={note} maxLength={2000}
                    placeholder="Write a few words about your day…" onChange={(e) => setNote(e.target.value)} />
          <div className="row spread" style={{ borderTop: "1px solid #e5e9f0", borderBottom: "1px solid #e5e9f0", padding: "10px 0" }}>
            <label htmlFor="mood-private" className="row" style={{ gap: 8, fontWeight: 500 }}>
              <Lock size={16} aria-hidden /> Keep this entry private
            </label>
            <Switch id="mood-private" checked={isPrivate} onChange={setPrivate} label="Keep this entry private" />
          </div>
          <p className="small muted">Private entries are never included in the anonymous campus statistics counsellors see.</p>
          {log.isError && <Alert>{messageFor(log.error)}</Alert>}
          {saved && !log.isPending && <Alert kind="success">{saved}</Alert>}
          <Button type="submit" size="lg" block busy={log.isPending} disabled={!mood}>Log Mood</Button>
        </div>
      </div>
    </form>
  );
}

function TrendCard() {
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const stats = useMoodStats(Number(days));
  const today = todayLocal();
  const axis = Array.from({ length: Number(days) }, (_, i) => addDays(today, i + 1 - Number(days)));
  const byDay = new Map((stats.data?.daily ?? []).map((d) => [d.day, d]));
  return (
    <Card title="Mood Trends" subtitle={`Your mood over the last ${days} days`}
          action={<Tabs label="Period" value={days} onChange={setDays}
                        options={[{ value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />}>
      {stats.isPending ? <Loading /> : stats.isError ? <ErrorAlert error={stats.error} /> : (
        <MoodLineChart labels={axis.map(shortDate)}
                       values={axis.map((d) => byDay.get(d)?.avg_mood ?? null)}
                       average={axis.map((d) => byDay.get(d)?.moving_avg_7d ?? null)}
                       label={`Daily mood and 7-day moving average over the last ${days} days`} />
      )}
    </Card>
  );
}

function InsightsCard() {
  const stats = useMoodStats(30);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const s = stats.data;
  const daysLogged = s?.daily.length ?? 0;
  const top = s && s.total_logs ? Object.entries(s.distribution).sort((a, b) => b[1] - a[1])[0] : null;

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const all = await unwrap(api.GET("/api/moods", { params: { query: { limit: 500 } } }));
      const csv = toCsv(["date", "time", "mood", "mood_label", "note", "private"],
        all.map((m) => [localDate(m.logged_at), new Date(m.logged_at).toISOString(), m.mood, moodInfo(m.mood).label, m.note, m.is_private]));
      downloadFile(`campuswell-mood-history-${todayLocal()}.csv`, csv, "text/csv");
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card title="Key Insights" subtitle="Patterns from your last 30 days">
      {stats.isPending ? <Loading /> : !s ? <ErrorAlert error={stats.error} /> : (
        <div className="stack">
          <div>
            <p className="eyebrow">Log consistency</p>
            <div className="row spread" style={{ margin: "6px 0" }}>
              <strong style={{ color: "#111827" }}>{s.streak_days}-day streak</strong>
              <span className={`badge ${daysLogged >= 21 ? "badge-green" : daysLogged >= 10 ? "badge-blue" : "badge-low"}`}>
                {daysLogged >= 21 ? "Excellent" : daysLogged >= 10 ? "Good" : "Getting started"}
              </span>
            </div>
            <div className="progress" aria-label={`Checked in on ${daysLogged} of 30 days`}>
              <span style={{ width: `${(daysLogged / 30) * 100}%` }} />
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>Checked in on {daysLogged} of the last 30 days.</p>
          </div>
          <div className="row spread"><span className="muted">Average mood</span><strong>{s.average_mood ?? "–"} / 5</strong></div>
          <div className="row spread">
            <span className="muted">Most frequent</span>
            <strong>{top ? moodInfo(Number(top[0])).label : "–"}</strong>
          </div>
          {error && <Alert>{error}</Alert>}
          <Button variant="secondary" icon={Download} busy={exporting} onClick={() => void exportCsv()}>Export Mood History</Button>
        </div>
      )}
    </Card>
  );
}

function Reflections() {
  const moods = useMoods(10);
  const remove = useDeleteMood();
  const [confirm, setConfirm] = useState<Mood | null>(null);
  return (
    <Card title="Recent Reflections">
      {moods.isPending ? <Loading /> : moods.isError ? <ErrorAlert error={moods.error} /> :
        moods.data.length === 0 ? <Empty>Your check-ins will appear here.</Empty> : (
          <ul className="list">
            {moods.data.map((m) => {
              const info = moodInfo(m.mood);
              return (
                <li key={m.log_id} className="list-item" style={{ alignItems: "flex-start" }}>
                  <info.icon size={24} color={info.color} aria-hidden style={{ flex: "none", marginTop: 2 }} />
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 8 }}>
                      <strong>{info.label}</strong>
                      <span className="small muted">{whenLabel(m.logged_at)}</span>
                      {m.is_private && <span className="badge"><Lock size={11} aria-hidden /> Private</span>}
                    </div>
                    {m.note && <p style={{ fontStyle: "italic", marginTop: 4 }}>“{m.note}”</p>}
                  </div>
                  <button type="button" className="icon-btn" aria-label={`Delete the ${info.label} entry from ${whenLabel(m.logged_at)}`}
                          onClick={() => setConfirm(m)}>
                    <Trash2 size={17} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      <ConfirmDialog open={confirm !== null} title="Delete this entry?" confirmLabel="Delete" busy={remove.isPending}
                     onCancel={() => setConfirm(null)}
                     onConfirm={() => confirm && remove.mutate(confirm.log_id, { onSuccess: () => setConfirm(null) })}>
        <p>This check-in will be removed from your history and charts. This can't be undone.</p>
      </ConfirmDialog>
    </Card>
  );
}

export function MoodPage() {
  return (
    <div className="stack-lg">
      <MoodForm />
      <div className="grid grid-main">
        <TrendCard />
        <InsightsCard />
      </div>
      <Reflections />
    </div>
  );
}
