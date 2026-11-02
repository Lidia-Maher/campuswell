import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";

import { api, unwrap } from "../../api/client";
import { MultiLineChart } from "../../components/charts";
import { Alert, Button, Card, Empty, ErrorAlert, Loading, Tabs } from "../../components/ui";
import { downloadFile, toCsv } from "../../lib/download";
import { addDays, shortDate, todayLocal } from "../../lib/format";

type Department = "computing" | "engineering" | "business";
const SCHOOLS: { value: Department; label: string; color: string }[] = [
  { value: "computing", label: "Computing", color: "#2e75b6" },
  { value: "engineering", label: "Engineering", color: "#52b788" },
  { value: "business", label: "Business", color: "#f2b631" },
];
const BANDS = ["minimal", "mild", "moderate", "moderately_severe", "severe"];
const BAND_LABEL: Record<string, string> = {
  minimal: "Minimal", mild: "Mild", moderate: "Moderate", moderately_severe: "Mod. severe", severe: "Severe",
};

export function CounsellorHome() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [school, setSchool] = useState<Department | "">("");
  const days = Number(range);
  const trends = useQuery({
    queryKey: ["counsellor", "mood-trends", days, school],
    queryFn: () => unwrap(api.GET("/api/counsellor/mood-trends", { params: { query: { days, department: school || undefined } } })),
  });
  const summary = useQuery({
    queryKey: ["counsellor", "assessment-summary", days],
    queryFn: () => unwrap(api.GET("/api/counsellor/assessment-summary", { params: { query: { days } } })),
  });

  const today = todayLocal();
  const axis = Array.from({ length: days }, (_, i) => addDays(today, i + 1 - days));
  const shown = SCHOOLS.filter((s) => !school || s.value === school);
  const rows = trends.data ?? [];
  const at = (dept: string, day: string) => rows.find((r) => r.department === dept && r.day === day);
  const summaryRows = (summary.data ?? []).filter((r) => !school || r.department === school);

  const totals = shown.map((s) => {
    const mine = rows.filter((r) => r.department === s.value);
    const logs = mine.reduce((n, r) => n + r.total_logs, 0);
    const low = mine.reduce((n, r) => n + r.stressed_or_anxious_logs, 0);
    const avg = logs ? mine.reduce((n, r) => n + r.avg_mood * r.total_logs, 0) / logs : null;
    return { ...s, logs, lowShare: logs ? Math.round((low / logs) * 100) : null, avg };
  });

  function exportCsv() {
    const csv = toCsv(
      ["day", "school", "students", "avg_mood", "stressed_or_anxious_checkins", "total_checkins"],
      rows.map((r) => [r.day, r.department, r.students, r.avg_mood, r.stressed_or_anxious_logs, r.total_logs]),
    );
    downloadFile(`campuswell-campus-trends-${days}d-${today}.csv`, csv, "text/csv");
  }

  return (
    <div className="stack-lg">
      <div className="row spread end">
        <div>
          <h2 style={{ fontSize: "1.6rem" }}>Campus Well-Being Trends</h2>
          <p className="muted">Anonymous, aggregated data only.</p>
        </div>
        <div className="row wrap">
          <label htmlFor="school-filter" className="sr-only">School</label>
          <select id="school-filter" className="input" style={{ width: "auto" }} value={school} onChange={(e) => setSchool(e.target.value as Department | "")}>
            <option value="">All schools</option>
            {SCHOOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Tabs label="Period" value={range} onChange={setRange}
                options={[{ value: "7", label: "7 Days" }, { value: "30", label: "30 Days" }, { value: "90", label: "90 Days" }]} />
        </div>
      </div>

      <Alert kind="info">
        No names, IDs or notes are ever shown. Days and groups with fewer than 5 students are hidden, and check-ins
        students mark private are never counted.
      </Alert>

      <div className="grid grid-3">
        {totals.map((t) => (
          <div key={t.value} className="card stack" style={{ gap: 4, borderTop: `4px solid ${t.color}` }}>
            <p className="eyebrow">{t.label}</p>
            <p className="num" style={{ fontSize: "1.6rem", fontWeight: 700, color: "#111827" }}>{t.avg ? t.avg.toFixed(2) : "–"}<span className="muted small"> avg mood</span></p>
            <p className="small muted">{t.lowShare === null ? "Not enough data" : `${t.lowShare}% of check-ins stressed or anxious · ${t.logs} check-ins`}</p>
          </div>
        ))}
      </div>

      <Card title="Average mood per school" subtitle="Daily average, 1 (anxious) to 5 (happy)"
            action={<Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>}>
        {trends.isPending ? <Loading /> : trends.isError ? <ErrorAlert error={trends.error} /> :
          rows.length === 0 ? <Empty>Not enough data for this period yet.</Empty> : (
            <MultiLineChart labels={axis.map(shortDate)} min={1} max={5}
                            series={shown.map((s) => ({ name: s.label, color: s.color, values: axis.map((d) => at(s.value, d)?.avg_mood ?? null) }))}
                            label={`Average mood per school per day, last ${days} days`} />
          )}
      </Card>

      <Card title="Questionnaire results" subtitle={`Students per severity level, from each student's latest result in the last ${days} days`}>
        {summary.isPending ? <Loading /> : summary.isError ? <ErrorAlert error={summary.error} /> :
          summaryRows.length === 0 ? <Empty>Not enough results yet: each group needs at least 5 students.</Empty> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>School</th><th>Questionnaire</th><th className="num">Students</th>
                    {BANDS.map((b) => <th key={b} className="num">{BAND_LABEL[b]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={`${r.department}-${r.assessment_type}`}>
                      <td>{SCHOOLS.find((s) => s.value === r.department)?.label ?? r.department}</td>
                      <td>{r.assessment_type === "PHQ9" ? "PHQ-9" : "GAD-7"}</td>
                      <td className="num">{r.students}</td>
                      {BANDS.map((b) => <td key={b} className="num">{r.severity[b] ?? "–"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
