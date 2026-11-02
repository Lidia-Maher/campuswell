import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, CalendarCheck, Clock, Flame, Lightbulb, Printer, Smile, Sparkles, Sun, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";

import { api, unwrap } from "../../api/client";
import { useMoodStats, useStudyStats } from "../../api/hooks";
import { BarChart, ComboChart, DoughnutChart, MoodLineChart } from "../../components/charts";
import { Button, Card, Empty, ErrorAlert, Loading, StatCard, Tabs } from "../../components/ui";
import { minutesLabel, shortDate, weekday } from "../../lib/format";
import { MOODS } from "../../lib/mood";

const INSIGHT_ICON = {
  correlation: TrendingUp, weekday_low: CalendarCheck, weekday_high: Sun,
  pomodoro_mood: Zap, best_focus_day: BrainCircuit, consistency: Flame,
} as const;

function describeCorrelation(r: number | null, strength: string, days: number) {
  if (r === null) return `Not enough data yet: this needs at least 7 days with a mood check-in (you have ${days}).`;
  const direction = r > 0 ? "positive" : "negative";
  const meaning = strength === "none" || strength === "weak"
    ? "Study time and mood barely move together for you."
    : r > 0 ? "On days you study more, your mood tends to be higher." : "On days you study more, your mood tends to be lower.";
  return `Correlation r = ${r.toFixed(2)} (${strength}${strength === "none" ? "" : ` ${direction}`}) over ${days} days. ${meaning}`;
}

export function AnalyticsPage() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const days = Number(range);
  const insights = useQuery({
    queryKey: ["insights", days],
    queryFn: () => unwrap(api.GET("/api/insights", { params: { query: { days } } })),
  });
  const mood = useMoodStats(days);
  const study = useStudyStats(days);
  const data = insights.data;
  const labels = data?.daily.map((d) => (days <= 7 ? weekday(d.day) : shortDate(d.day))) ?? [];
  const totalLogs = mood.data?.total_logs ?? 0;

  return (
    <div className="stack-lg">
      <div className="row spread end">
        <div>
          <h2 style={{ fontSize: "1.6rem" }}>Well-being Insights</h2>
          <p className="muted">How your study habits and mood relate, from your own data.</p>
        </div>
        <div className="row wrap no-print">
          <Tabs label="Period" value={range} onChange={setRange}
                options={[{ value: "7", label: "7 Days" }, { value: "30", label: "30 Days" }, { value: "90", label: "90 Days" }]} />
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Save as PDF</Button>
        </div>
      </div>

      <div className="grid grid-4">
        <StatCard icon={Smile} label="Avg. mood score" value={mood.data?.average_mood != null ? `${mood.data.average_mood} / 5` : "–"} />
        <StatCard icon={Clock} label="Daily study (avg.)" tone="green"
                  value={study.data ? minutesLabel(study.data.focus_minutes / days) : "–"} />
        <StatCard icon={Zap} label="Focus sessions" tone="amber" value={study.data?.sessions_completed ?? "–"} />
        <StatCard icon={CalendarCheck} label="Check-in days" tone="green"
                  value={data ? `${data.correlation.days_used} / ${days}` : "–"} />
      </div>

      {insights.isPending ? <Loading /> : insights.isError ? <ErrorAlert error={insights.error} /> : data && (
        <>
          <div className="grid grid-half">
            <Card title="Mood Trends" subtitle="Average mood per day">
              <MoodLineChart labels={labels} values={data.daily.map((d) => d.mood)} label={`Average mood per day, last ${days} days`} />
            </Card>
            <Card title="Study Time" subtitle="Focused minutes per day">
              <BarChart labels={labels} values={data.daily.map((d) => d.focus_minutes)} color="#52b788"
                        label={`Focused minutes per day, last ${days} days`} unit=" min" />
            </Card>
          </div>

          <div className="grid grid-main">
            <Card title="Stress vs. Productivity" subtitle="How study time and mood move together">
              <ComboChart labels={labels} bars={data.daily.map((d) => d.focus_minutes)} line={data.daily.map((d) => d.mood)}
                          barLabel="Focus minutes" lineLabel="Mood (1–5)" />
              <div className="alert alert-info" style={{ marginTop: 14 }}>
                <BrainCircuit size={18} aria-hidden style={{ flex: "none" }} />
                <div>
                  <strong>Pattern: </strong>
                  {describeCorrelation(data.correlation.r, data.correlation.strength, data.correlation.days_used)}
                </div>
              </div>
            </Card>
            <Card title="Mood Distribution" subtitle={`Over the last ${days} days`}>
              {!mood.data || totalLogs === 0 ? <Empty>No check-ins in this period.</Empty> : (
                <div className="stack">
                  <DoughnutChart labels={MOODS.map((m) => m.label)} colors={MOODS.map((m) => m.color)}
                                 values={MOODS.map((m) => mood.data.distribution[String(m.value)] ?? 0)}
                                 label="Share of each mood" />
                  <ul className="list" style={{ gap: 6 }}>
                    {MOODS.map((m) => {
                      const n = mood.data.distribution[String(m.value)] ?? 0;
                      return (
                        <li key={m.value} className="row spread small">
                          <span className="row" style={{ gap: 8 }}>
                            <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color }} aria-hidden />
                            {m.label}
                          </span>
                          <strong className="num">{Math.round((n / totalLogs) * 100)}%</strong>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <section className="stack">
            <h2 className="row"><Sparkles size={20} color="#2e75b6" aria-hidden /> Behavioral Habits &amp; Insights</h2>
            {data.insights.length === 0 ? (
              <Card><Empty icon={Lightbulb}>Keep checking in and using focus sessions. Patterns appear after about a week.</Empty></Card>
            ) : (
              <div className="grid grid-3">
                {data.insights.map((i) => {
                  const Icon = INSIGHT_ICON[i.kind as keyof typeof INSIGHT_ICON] ?? Lightbulb;
                  return (
                    <div key={i.kind} className={`card ${i.kind === "weekday_low" ? "" : "tint-blue"}`}
                         style={i.kind === "weekday_low" ? { background: "#fdf3e2", borderColor: "#f5dfb8" } : undefined}>
                      <div className="row" style={{ alignItems: "flex-start" }}>
                        <Icon size={20} color="#2e75b6" aria-hidden style={{ flex: "none", marginTop: 2 }} />
                        <div className="stack" style={{ gap: 4 }}>
                          <h3>{i.title}</h3>
                          <p className="small">{i.message}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
