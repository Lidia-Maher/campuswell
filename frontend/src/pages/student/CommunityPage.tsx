import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Heart, MessagesSquare, Send, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { Alert, Button, Card, ConfirmDialog, Empty, ErrorAlert, Loading, Tabs } from "../../components/ui";
import { whenLabel } from "../../lib/format";

type Post = Schemas["PostOut"];
const PAGE = 20;
const REPORT_REASONS = ["Harassment or bullying", "Harmful or dangerous content", "Spam or advertising", "Personal information", "Something else"];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function Compose() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const create = useMutation({
    mutationFn: () => unwrap(api.POST("/api/posts", { body: { content: text.trim() } })),
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["posts", "mine"] }); },
  });
  return (
    <Card>
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); if (text.trim()) create.mutate(); }}>
        <label htmlFor="compose" className="eyebrow">Share something supportive</label>
        <textarea id="compose" className="input" rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="A tip, some encouragement, or how you're getting through the week…" />
        <div className="row spread">
          <span className="small muted">{text.length}/500 · Posts are reviewed by an admin before they appear.</span>
          <Button type="submit" icon={Send} busy={create.isPending} disabled={!text.trim()}>Post</Button>
        </div>
        {create.isSuccess && <Alert kind="success">Thanks! Your post will appear once it's approved. See "My posts".</Alert>}
        {create.isError && <Alert>{messageFor(create.error)}</Alert>}
      </form>
    </Card>
  );
}

function PostCard({ post, onReport, onDelete }: { post: Post; onReport: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const like = useMutation({
    mutationFn: () => post.liked_by_me
      ? unwrap(api.DELETE("/api/posts/{post_id}/like", { params: { path: { post_id: post.post_id } } }))
      : unwrap(api.PUT("/api/posts/{post_id}/like", { params: { path: { post_id: post.post_id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["posts", "feed"] }),
  });
  return (
    <article className="card stack" style={{ gap: 10 }}>
      <div className="row">
        <span className="avatar" aria-hidden>{initials(post.author_name)}</span>
        <div className="grow">
          <strong style={{ color: "#111827" }}>{post.author_name}{post.is_mine && <span className="muted"> (you)</span>}</strong>
          <div className="small muted">{whenLabel(post.created_at)}</div>
        </div>
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{post.content}</p>
      <div className="row" style={{ gap: 4 }}>
        <button type="button" className="btn btn-quiet" onClick={() => like.mutate()} disabled={like.isPending}
                aria-pressed={post.liked_by_me} style={{ color: post.liked_by_me ? "#dc2626" : undefined }}>
          <Heart size={17} fill={post.liked_by_me ? "#dc2626" : "none"} aria-hidden />
          <span className="num">{post.like_count}</span>
          <span className="sr-only">{post.liked_by_me ? "Unlike" : "Like"}</span>
        </button>
        {post.is_mine ? (
          <button type="button" className="btn btn-quiet" onClick={onDelete}><Trash2 size={16} aria-hidden /> Delete</button>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={onReport}><Flag size={16} aria-hidden /> Report</button>
        )}
      </div>
    </article>
  );
}

function Feed() {
  const qc = useQueryClient();
  const feed = useInfiniteQuery({
    queryKey: ["posts", "feed"],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => unwrap(api.GET("/api/posts", { params: { query: { limit: PAGE, before_id: pageParam } } })),
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].post_id : undefined),
  });
  const [reporting, setReporting] = useState<Post | null>(null);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [notice, setNotice] = useState("");
  const report = useMutation({
    mutationFn: (p: Post) => unwrap(api.POST("/api/posts/{post_id}/report", { params: { path: { post_id: p.post_id } }, body: { reason } })),
    onSuccess: () => { setReporting(null); setNotice("Thanks. An admin will review the post."); },
    onError: (e) => { setReporting(null); setNotice(messageFor(e)); },
  });
  const remove = useMutation({
    mutationFn: (p: Post) => unwrap(api.DELETE("/api/posts/{post_id}", { params: { path: { post_id: p.post_id } } })),
    onSuccess: () => { setDeleting(null); void qc.invalidateQueries({ queryKey: ["posts"] }); },
  });
  const posts = feed.data?.pages.flat() ?? [];

  return (
    <div className="stack">
      {notice && <Alert kind="info">{notice}</Alert>}
      {feed.isPending ? <Loading /> : feed.isError ? <ErrorAlert error={feed.error} /> :
        posts.length === 0 ? <Card><Empty icon={MessagesSquare}>No posts yet. Be the first to share something.</Empty></Card> : (
          <>
            {posts.map((p) => <PostCard key={p.post_id} post={p} onReport={() => setReporting(p)} onDelete={() => setDeleting(p)} />)}
            {feed.hasNextPage && (
              <Button variant="secondary" busy={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>Load older posts</Button>
            )}
          </>
        )}
      <ConfirmDialog open={reporting !== null} title="Report this post?" confirmLabel="Send report" danger={false}
                     busy={report.isPending} onCancel={() => setReporting(null)} onConfirm={() => reporting && report.mutate(reporting)}>
        <div className="field">
          <label htmlFor="report-reason">What's wrong with it?</label>
          <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
      </ConfirmDialog>
      <ConfirmDialog open={deleting !== null} title="Delete your post?" confirmLabel="Delete" busy={remove.isPending}
                     onCancel={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting)}>
        <p>Your post and its likes will be removed.</p>
      </ConfirmDialog>
    </div>
  );
}

const STATUS = {
  pending: { label: "Waiting for review", badge: "badge-warning" },
  approved: { label: "Published", badge: "badge-green" },
  rejected: { label: "Not published", badge: "badge-danger" },
} as const;

function MyPosts() {
  const mine = useQuery({ queryKey: ["posts", "mine"], queryFn: () => unwrap(api.GET("/api/posts/mine")) });
  if (mine.isPending) return <Loading />;
  if (mine.isError) return <ErrorAlert error={mine.error} />;
  if (mine.data.length === 0) return <Card><Empty>You haven't posted yet.</Empty></Card>;
  return (
    <div className="stack">
      {mine.data.map((p) => {
        const s = STATUS[p.status as keyof typeof STATUS];
        return (
          <article key={p.post_id} className="card stack" style={{ gap: 8 }}>
            <div className="row spread">
              <span className="small muted">{whenLabel(p.created_at)}</span>
              <span className={`badge ${s.badge}`}>{s.label}</span>
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{p.content}</p>
            {p.rejection_reason && <Alert kind="warning">Reason: {p.rejection_reason}</Alert>}
            {p.status === "approved" && <span className="small muted">{p.like_count} likes</span>}
          </article>
        );
      })}
    </div>
  );
}

export function CommunityPage() {
  const [tab, setTab] = useState<"feed" | "mine">("feed");
  return (
    <div className="stack-lg" style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
      <div>
        <h2 style={{ fontSize: "1.6rem" }}>Community Board</h2>
        <p className="muted">Peer support from PSUT students. Be kind: every post is reviewed before it's published.</p>
      </div>
      <Compose />
      <Tabs label="Show" value={tab} onChange={setTab} options={[{ value: "feed", label: "Feed" }, { value: "mine", label: "My posts" }]} />
      {tab === "feed" ? <Feed /> : <MyPosts />}
    </div>
  );
}
