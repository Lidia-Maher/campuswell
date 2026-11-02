import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Flag, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { Alert, Button, Card, ConfirmDialog, Empty, ErrorAlert, Loading, Tabs } from "../../components/ui";
import { whenLabel } from "../../lib/format";

type ModPost = Schemas["ModerationPostOut"];
type Report = Schemas["ReportOut"];
const REJECT_REASONS = ["Advertising is not allowed", "Not respectful to others", "Shares personal information", "Off-topic for the support board"];

function useRefreshModeration() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["posts"] });
  };
}

function Queue() {
  const refresh = useRefreshModeration();
  const posts = useQuery({ queryKey: ["admin", "posts", "pending"], queryFn: () => unwrap(api.GET("/api/admin/posts", { params: { query: { status: "pending" } } })) });
  const [rejecting, setRejecting] = useState<ModPost | null>(null);
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const review = useMutation({
    mutationFn: ({ post, decision }: { post: ModPost; decision: "approve" | "reject" }) =>
      unwrap(api.POST("/api/admin/posts/{post_id}/review", {
        params: { path: { post_id: post.post_id } },
        body: { decision, rejection_reason: decision === "reject" ? reason : null },
      })),
    onSuccess: () => { setRejecting(null); refresh(); },
  });

  if (posts.isPending) return <Loading />;
  if (posts.isError) return <ErrorAlert error={posts.error} />;
  return (
    <div className="stack">
      {review.isError && <Alert>{messageFor(review.error)}</Alert>}
      {posts.data.length === 0 ? <Card><Empty icon={Check}>All caught up. No posts waiting.</Empty></Card> :
        posts.data.map((p) => (
          <article key={p.post_id} className="card stack" style={{ gap: 10 }}>
            <div className="row spread">
              <strong style={{ color: "#111827" }}>{p.author_name}</strong>
              <span className="small muted">submitted {whenLabel(p.created_at)}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{p.content}</p>
            <div className="row">
              <Button icon={Check} busy={review.isPending} onClick={() => review.mutate({ post: p, decision: "approve" })}>Approve</Button>
              <Button variant="danger-outline" icon={X} onClick={() => setRejecting(p)}>Reject</Button>
            </div>
          </article>
        ))}
      <ConfirmDialog open={rejecting !== null} title="Reject this post?" confirmLabel="Reject post" busy={review.isPending}
                     onCancel={() => setRejecting(null)} onConfirm={() => rejecting && review.mutate({ post: rejecting, decision: "reject" })}>
        <div className="field">
          <label htmlFor="reject-reason">Reason (the author sees this)</label>
          <select id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Reports() {
  const refresh = useRefreshModeration();
  const reports = useQuery({ queryKey: ["admin", "reports", "open"], queryFn: () => unwrap(api.GET("/api/admin/reports", { params: { query: { status: "open" } } })) });
  const [removing, setRemoving] = useState<Report | null>(null);
  const resolve = useMutation({
    mutationFn: ({ report, resolution }: { report: Report; resolution: "action_taken" | "dismissed" }) =>
      unwrap(api.POST("/api/admin/reports/{report_id}/resolve", { params: { path: { report_id: report.report_id } }, body: { resolution } })),
    onSuccess: () => { setRemoving(null); refresh(); },
  });

  if (reports.isPending) return <Loading />;
  if (reports.isError) return <ErrorAlert error={reports.error} />;
  return (
    <div className="stack">
      {resolve.isError && <Alert>{messageFor(resolve.error)}</Alert>}
      {reports.data.length === 0 ? <Card><Empty icon={Flag}>No open reports.</Empty></Card> :
        reports.data.map((r) => (
          <article key={r.report_id} className="card stack" style={{ gap: 10 }}>
            <div className="row spread">
              <span className="badge badge-danger"><Flag size={12} aria-hidden /> {r.reason}</span>
              <span className="small muted">reported {whenLabel(r.created_at)}</span>
            </div>
            <blockquote style={{ margin: 0, paddingLeft: 12, borderLeft: "3px solid #e5e9f0" }}>{r.post_content}</blockquote>
            <div className="row wrap">
              <Button variant="danger" onClick={() => setRemoving(r)}>Remove post</Button>
              <Button variant="secondary" busy={resolve.isPending} onClick={() => resolve.mutate({ report: r, resolution: "dismissed" })}>
                Keep post (dismiss)
              </Button>
            </div>
          </article>
        ))}
      <ConfirmDialog open={removing !== null} title="Remove this post?" confirmLabel="Remove post" busy={resolve.isPending}
                     onCancel={() => setRemoving(null)} onConfirm={() => removing && resolve.mutate({ report: removing, resolution: "action_taken" })}>
        <p>The post is taken off the board and every open report on it is closed. The author sees why.</p>
      </ConfirmDialog>
    </div>
  );
}

export function ModerationPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "reports" ? "reports" : "queue";
  return (
    <div className="stack-lg" style={{ maxWidth: 820, margin: "0 auto", width: "100%" }}>
      <Tabs label="Moderation" value={tab} onChange={(t) => setParams(t === "reports" ? { tab: "reports" } : {})}
            options={[{ value: "queue", label: "Waiting for review" }, { value: "reports", label: "Reports" }]} />
      {tab === "queue" ? <Queue /> : <Reports />}
    </div>
  );
}
