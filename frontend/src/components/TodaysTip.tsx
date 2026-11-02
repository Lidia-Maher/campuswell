import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, ThumbsDown, ThumbsUp } from "lucide-react";

import { api, unwrap } from "../api/client";
import { ApiError } from "../api/errors";
import { Button, ErrorAlert, Loading } from "./ui";

/** The daily suggestion (FR-11) with "was this helpful?" feedback. */
export function TodaysTip() {
  const qc = useQueryClient();
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
    onSuccess: (updated) => qc.setQueryData(["suggestions", "today"], updated),
  });

  if (tip.isPending) return <section className="card"><Loading label="Loading today's tip…" /></section>;
  if (tip.isError) {
    if (tip.error instanceof ApiError && tip.error.code === "no_suggestions_available") return null;
    return <ErrorAlert error={tip.error} />;
  }
  const t = tip.data;
  return (
    <section className="card tint-blue stack" aria-labelledby="tip-title">
      <div className="row">
        <Lightbulb size={20} color="#2e75b6" aria-hidden />
        <h2 id="tip-title" style={{ color: "#2e75b6" }}>Today's Insight</h2>
      </div>
      <p style={{ color: "#1f2937", fontWeight: 500 }}>{t.message}</p>
      {t.reason && <p className="small muted">{t.reason}</p>}
      {t.was_helpful === null ? (
        <div className="row wrap">
          <span className="small muted">Was this helpful?</span>
          <Button variant="secondary" icon={ThumbsUp} busy={feedback.isPending} onClick={() => feedback.mutate(true)}>Yes</Button>
          <Button variant="secondary" icon={ThumbsDown} busy={feedback.isPending} onClick={() => feedback.mutate(false)}>No</Button>
        </div>
      ) : (
        <p className="small muted">Thanks for your feedback.</p>
      )}
    </section>
  );
}
