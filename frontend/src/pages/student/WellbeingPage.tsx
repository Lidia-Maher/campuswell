import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Headphones, MapPin, Moon, Play, Square, Wind, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { SupportPanel } from "../../components/SupportPanel";
import { Alert, Button, Card, Empty, ErrorAlert, Loading, Tabs } from "../../components/ui";

type Content = Schemas["ContentOut"];
type Tab = "meditation" | "breathing" | "sleep_sounds" | "resources";

const CATEGORY = {
  meditation: { label: "Meditation", icon: Headphones, gradient: "linear-gradient(135deg,#cfe0f1,#eaf2fa)" },
  breathing: { label: "Breathing", icon: Wind, gradient: "linear-gradient(135deg,#cdebdc,#eef8f3)" },
  sleep_sounds: { label: "Sleep Sounds", icon: Moon, gradient: "linear-gradient(135deg,#d9d4f0,#f1eefa)" },
} as const;

const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;

function useLogSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["SessionCreate"]) => unwrap(api.POST("/api/wellness/sessions", { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wellness", "stats"] });
      void qc.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
}

/** Saves a session once, when it finishes or when the user stops it (15 seconds or more). */
function useSessionRecorder(item: Content) {
  const log = useLogSession();
  const startedAt = useRef<Date | null>(null);
  const saved = useRef(false);
  return {
    log,
    start: () => { if (!startedAt.current) startedAt.current = new Date(); saved.current = false; },
    finish: (seconds: number, completed: boolean) => {
      if (saved.current || !startedAt.current || (!completed && seconds < 15)) return;
      saved.current = true;
      log.mutate({ content_id: item.content_id, duration_seconds: Math.round(seconds), is_completed: completed,
                   started_at: startedAt.current.toISOString(), ended_at: new Date().toISOString() });
      startedAt.current = null;
    },
  };
}

function BreathingGuide({ item }: { item: Content }) {
  const phases = [
    { name: "Breathe in", seconds: item.inhale_seconds ?? 4, scale: 1 },
    ...(item.hold_seconds ? [{ name: "Hold", seconds: item.hold_seconds, scale: 1 }] : []),
    { name: "Breathe out", seconds: item.exhale_seconds ?? 4, scale: 0.55 },
  ];
  const cycle = phases.reduce((s, p) => s + p.seconds, 0);
  const rec = useSessionRecorder(item);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const elapsed = startMs ? Math.min(item.duration_seconds, (now - startMs) / 1000) : 0;
  const running = startMs !== null && elapsed < item.duration_seconds;
  let t = elapsed % cycle;
  const phase = phases.find((p) => (t -= p.seconds) < 0) ?? phases[0];
  const phaseLeft = Math.ceil(-t);

  useEffect(() => {
    if (!startMs) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [startMs]);

  useEffect(() => {
    if (startMs && elapsed >= item.duration_seconds) {
      rec.finish(item.duration_seconds, true);
      setStartMs(null);
    }
  });

  const left = item.duration_seconds - elapsed;
  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <div style={{ width: 220, height: 220, display: "grid", placeItems: "center" }}>
        <div aria-hidden style={{
          width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle,#52b788 0%,#2e75b6 100%)",
          transform: `scale(${running ? phase.scale : 0.7})`,
          transition: `transform ${running ? phase.seconds : 0.4}s ease-in-out`, opacity: 0.85,
        }} />
      </div>
      <p aria-live="polite" style={{ fontSize: "1.4rem", fontWeight: 700, color: "#111827" }}>
        {running ? `${phase.name} · ${phaseLeft}` : elapsed >= item.duration_seconds ? "Well done" : "Ready when you are"}
      </p>
      <p className="muted small">
        Pattern: in {item.inhale_seconds}s{item.hold_seconds ? ` · hold ${item.hold_seconds}s` : ""} · out {item.exhale_seconds}s
        {running && ` · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")} left`}
      </p>
      {running
        ? <Button variant="secondary" icon={Square} onClick={() => { rec.finish(elapsed, false); setStartMs(null); }}>Stop</Button>
        : <Button icon={Play} onClick={() => { rec.start(); setNow(Date.now()); setStartMs(Date.now()); }}>Start</Button>}
      {rec.log.isSuccess && <Alert kind="success">Session saved.</Alert>}
      {rec.log.isError && <Alert>{messageFor(rec.log.error)}</Alert>}
    </div>
  );
}

function AudioSession({ item }: { item: Content }) {
  const rec = useSessionRecorder(item);
  const listened = useRef(0);
  const last = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  // when the player is closed or switched, save what was listened to
  const finishRef = useRef(rec.finish);
  finishRef.current = rec.finish;
  useEffect(() => () => finishRef.current(listened.current, false), []);

  return (
    <div className="stack">
      {failed ? (
        <Alert kind="warning">This audio isn't available yet. The team still needs to add the real recording.</Alert>
      ) : (
        <audio controls preload="none" src={item.media_url ?? undefined} style={{ width: "100%" }}
               onPlay={() => { rec.start(); last.current = null; }}
               onTimeUpdate={(e) => {
                 const t = e.currentTarget.currentTime;
                 if (last.current !== null && t > last.current && t - last.current < 2) listened.current += t - last.current;
                 last.current = t;
               }}
               onEnded={() => rec.finish(listened.current, true)}
               onError={() => setFailed(true)} />
      )}
      {rec.log.isSuccess && <Alert kind="success">Session saved.</Alert>}
    </div>
  );
}

function Player({ item, onClose }: { item: Content; onClose: () => void }) {
  const cat = CATEGORY[item.category as keyof typeof CATEGORY];
  return (
    <Card title={<span className="row"><cat.icon size={20} color="#2e75b6" aria-hidden /> {item.title}</span>}
          subtitle={`${cat.label} · ${minutes(item.duration_seconds)}`}
          action={<button type="button" className="icon-btn" onClick={onClose} aria-label="Close player"><X size={20} /></button>}>
      {item.description && <p className="muted" style={{ marginBottom: 16 }}>{item.description}</p>}
      {item.category === "breathing" ? <BreathingGuide item={item} /> : <AudioSession item={item} />}
    </Card>
  );
}

function ContentCard({ item, onOpen }: { item: Content; onOpen: () => void }) {
  const cat = CATEGORY[item.category as keyof typeof CATEGORY];
  return (
    <article className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ background: cat.gradient, height: 120, display: "grid", placeItems: "center", position: "relative" }}>
        <cat.icon size={40} color="#2e75b6" aria-hidden />
        <span className="badge" style={{ position: "absolute", left: 12, bottom: 12, background: "#fff" }}>{cat.label}</span>
      </div>
      <div className="stack" style={{ padding: 18, gap: 8, flex: 1 }}>
        <h3>{item.title}</h3>
        <p className="small muted row" style={{ gap: 6 }}><Clock size={14} aria-hidden /> {minutes(item.duration_seconds)}</p>
        {item.description && <p className="small">{item.description}</p>}
        <div style={{ marginTop: "auto" }}>
          <Button variant="secondary" icon={Play} onClick={onOpen} aria-label={`Start ${item.title}`}>Start</Button>
        </div>
      </div>
    </article>
  );
}

export function WellbeingPage() {
  const [tab, setTab] = useState<Tab>("meditation");
  const [open, setOpen] = useState<Content | null>(null);
  const content = useQuery({ queryKey: ["wellness", "content"], queryFn: () => unwrap(api.GET("/api/wellness/content")) });
  const stats = useQuery({
    queryKey: ["wellness", "stats", 30],
    queryFn: () => unwrap(api.GET("/api/wellness/stats", { params: { query: { days: 30 } } })),
  });
  const items = (content.data ?? []).filter((c) => c.category === tab);

  return (
    <div className="stack-lg">
      <div className="row spread end">
        <div>
          <h2 style={{ fontSize: "1.6rem" }}>Wellness Library</h2>
          <p className="muted">Curated resources to help you recharge, focus, and find balance.</p>
        </div>
        {stats.data && (
          <span className="badge badge-green">
            Last 30 days: {stats.data.sessions} sessions · {Math.round(stats.data.minutes)} min
          </span>
        )}
      </div>

      <Tabs label="Category" primary value={tab} onChange={(t) => { setTab(t); setOpen(null); }}
            options={[
              { value: "meditation", label: "Meditation", icon: Headphones },
              { value: "breathing", label: "Breathing", icon: Wind },
              { value: "sleep_sounds", label: "Sleep Sounds", icon: Moon },
              { value: "resources", label: "Campus Resources", icon: MapPin },
            ]} />

      {open && <Player key={open.content_id} item={open} onClose={() => setOpen(null)} />}

      {tab === "resources" ? <SupportPanel /> : content.isPending ? <Loading /> : content.isError ? (
        <ErrorAlert error={content.error} />
      ) : items.length === 0 ? <Empty>No content in this category yet.</Empty> : (
        <div className="grid grid-3">
          {items.map((c) => <ContentCard key={c.content_id} item={c} onOpen={() => { setOpen(c); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}
        </div>
      )}

      <section className="card tint-blue" style={{ textAlign: "center" }}>
        <p style={{ fontSize: "1.15rem", fontStyle: "italic", color: "#1f2937" }}>
          “Small steps in the right direction can turn out to be the biggest steps of your life.”
        </p>
        <p className="eyebrow" style={{ marginTop: 8 }}>Daily mindset</p>
      </section>
    </div>
  );
}
