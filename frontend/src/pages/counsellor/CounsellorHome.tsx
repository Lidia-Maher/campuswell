import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { Alert } from "../../components/ui";

const SCHOOL: Record<string, string> = {
  computing: "Computing",
  engineering: "Engineering",
  business: "Business",
};
const BANDS = ["minimal", "mild", "moderate", "moderately_severe", "severe"];
const BAND_LABEL: Record<string, string> = {
  minimal: "Minimal", mild: "Mild", moderate: "Moderate", moderately_severe: "Mod. severe", severe: "Severe",
};

export function CounsellorHome() {
  const summary = useQuery({
    queryKey: ["counsellor", "assessment-summary", 30],
    queryFn: () => unwrap(api.GET("/api/counsellor/assessment-summary", { params: { query: { days: 30 } } })),
  });

  return (
    <div className="stack-lg">
      <h1>Reports</h1>
      <p className="muted">
        Anonymous totals for the last 30 days, from each student's latest questionnaire. Groups with fewer than 5
        students are not shown.
      </p>
      {summary.isPending && <p className="muted">Loading…</p>}
      {summary.isError && <Alert>{messageFor(summary.error)}</Alert>}
      {summary.data && summary.data.length === 0 && (
        <Alert kind="info">Not enough results yet: each group needs at least 5 students.</Alert>
      )}
      {summary.data && summary.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Questionnaire</th>
                <th className="num">Students</th>
                {BANDS.map((b) => <th key={b} className="num">{BAND_LABEL[b]}</th>)}
              </tr>
            </thead>
            <tbody>
              {summary.data.map((row) => (
                <tr key={`${row.department}-${row.assessment_type}`}>
                  <td>{SCHOOL[row.department] ?? row.department}</td>
                  <td>{row.assessment_type === "PHQ9" ? "PHQ-9" : "GAD-7"}</td>
                  <td className="num">{row.students}</td>
                  {BANDS.map((b) => <td key={b} className="num">{row.severity[b] ?? "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
