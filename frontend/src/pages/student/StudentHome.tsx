import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import { ApiError, messageFor } from "../../api/errors";
import { useCurrentUser } from "../../auth/AuthProvider";
import { Alert, Button } from "../../components/ui";

const MOOD_LABELS: Record<string, string> = { "5": "Happy", "4": "Neutral", "3": "Sad", "2": "Stressed", "1": "Anxious" };

function TodaysTip() {
  const queryClient = useQueryClient();
  const tip = useQuery({
    queryKey: ["suggestions", "today"],
    queryFn: () => unwrap(api.GET("/api/suggestions/today")),
  });
  const feedback = useMutation({
    mutationFn: (helpful: boolean) =>
      unwrap(api.POST("/api/suggestions/{suggestion_id}/feedback", {
        params: { path: { suggestion_id: tip.data!.suggestion_id } },
        body: { was_helpful: helpful },
      })),
    onSuccess: (updated) => queryClient.setQueryData(["suggestions", "today"], updated),
  });

  if (tip.isPending) return <div className="panel"><p className="muted">Loading today's tip…</p></div>;
  if (tip.isError) {
    if (tip.error instanceof ApiError && tip.error.code === "no_suggestions_available") return null;
    return <Alert>{messageFor(tip.error)}</Alert>;
  }
  const t = tip.data;
  return (
    <div className={`panel stack ${t.category === "support" ? "panel-support" : ""}`}>
      <p className="eyebrow">Today's tip</p>
      <p className="tip">{t.message}</p>
      {t.reason && <p className="muted">{t.reason}</p>}
      {t.was_helpful === null ? (
        <div className="row wrap">
          <span className="muted">Was this helpful?</span>
          <Button variant="secondary" busy={feedback.isPending} onClick={() => feedback.mutate(true)}>Yes</Button>
          <Button variant="secondary" busy={feedback.isPending} onClick={() => feedback.mutate(false)}>No</Button>
        </div>
      ) : (
        <p className="muted">Thanks for your feedback.</p>
      )}
    </div>
  );
}

function WeekAtAGlance() {
  const stats = useQuery({
    queryKey: ["moods", "stats", 7],
    queryFn: () => unwrap(api.GET("/api/moods/stats", { params: { query: { days: 7 } } })),
  });
  if (stats.isPending) return <div className="panel"><p className="muted">Loading your week…</p></div>;
  if (stats.isError) return <Alert>{messageFor(stats.error)}</Alert>;
  const s = stats.data;
  const commonest = Object.entries(s.distribution).sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="panel stack">
      <p className="eyebrow">Your last 7 days</p>
      <dl className="stats">
        <div><dt>Check-in streak</dt><dd>{s.streak_days} {s.streak_days === 1 ? "day" : "days"}</dd></div>
        <div><dt>Average mood</dt><dd>{s.average_mood ?? "–"}<span className="muted"> / 5</span></dd></div>
        <div><dt>Check-ins</dt><dd>{s.total_logs}</dd></div>
        <div><dt>Most often</dt><dd>{s.total_logs && commonest ? MOOD_LABELS[commonest[0]] : "–"}</dd></div>
      </dl>
    </div>
  );
}

export function StudentHome() {
  const user = useCurrentUser();
  const firstName = user.name.split(" ")[0];
  return (
    <div className="stack-lg">
      <h1>Hello, {firstName}</h1>
      <TodaysTip />
      <WeekAtAGlance />
    </div>
  );
}
