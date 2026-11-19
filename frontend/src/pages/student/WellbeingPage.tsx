import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Headphones, MapPin, Moon, Pause, Play, Square, Volume2, Wind, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { SupportPanel } from "../../components/SupportPanel";
import { Alert, Button, Card, Empty, ErrorAlert, Loading, Switch, Tabs } from "../../components/ui";
import { canSpeak, MEDITATIONS, speak, type Step, stopSpeaking } from "../../lib/meditations";
import { audioContext, builtinName, chime, isSound, type SoundHandle, type SoundName, startSound } from "../../lib/soundscapes";

type Content = Schemas["ContentOut"];
type Tab = "meditation" | "breathing" | "sleep_sounds" | "resources";

const CATEGORY = {
  meditation: { label: "Meditation", icon: Headphones, gradient: "linear-gradient(135deg,#cfe0f1,#eaf2fa)" },
  breathing: { label: "Breathing", icon: Wind, gradient: "linear-gradient(135deg,#cdebdc,#eef8f3)" },
  sleep_sounds: { label: "Sleep Sounds", icon: Moon, gradient: "linear-gradient(135deg,#d9d4f0,#f1eefa)" },
} as const;

const minutes = (seconds: number) => `${Math.round(seconds / 60)} min`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

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
  const [cues, setCues] = useState(true);

  const elapsed = startMs ? Math.min(item.duration_seconds, (now - startMs) / 1000) : 0;
  const running = startMs !== null && elapsed < item.duration_seconds;
  let t = elapsed % cycle;
  const phase = phases.find((p) => (t -= p.seconds) < 0) ?? phases[0];
  const phaseLeft = Math.ceil(-t);

  // a soft tone when each breath starts: higher to breathe in, lower to breathe out
  const cue = running ? `${Math.floor(elapsed / cycle)}-${phases.indexOf(phase)}` : "";
  useEffect(() => {
    if (cue && cues && phase.name !== "Hold") chime(phase.name === "Breathe in" ? 396 : 264, 1.8, 0.15);
  }, [cue]); // only when the breath changes, not when the switch is flipped

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
        : <Button icon={Play} onClick={() => { if (cues) audioContext(); rec.start(); setNow(Date.now()); setStartMs(Date.now()); }}>Start</Button>}
      <label className="row small muted" htmlFor={`cues-${item.content_id}`} style={{ gap: 8 }}>
        <Switch id={`cues-${item.content_id}`} label="Sound cues" checked={cues} onChange={setCues} /> Sound cues
      </label>
      {rec.log.isSuccess && <Alert kind="success">Session saved.</Alert>}
      {rec.log.isError && <Alert>{messageFor(rec.log.error)}</Alert>}
    </div>
  );
}

/** Keeps the latest `finish` so cleanup on close can still save the session. */
function useFinishOnClose(rec: ReturnType<typeof useSessionRecorder>, seconds: () => number, cleanup?: () => void) {
  const latest = useRef({ rec, seconds, cleanup });
  latest.current = { rec, seconds, cleanup };
  useEffect(() => () => {
    latest.current.cleanup?.();
    latest.current.rec.finish(latest.current.seconds(), false);
  }, []);
  return latest;
}

const SLEEP_TIMERS = [15, 30, 45, 60];

/** Sleep sounds made in the browser (lib/soundscapes), with a volume control and a sleep timer. */
function SoundPlayer({ item, name }: { item: Content; name: SoundName }) {
  const rec = useSessionRecorder(item);
  const sound = useRef<SoundHandle | null>(null);
  const listened = useRef(0);
  const [seconds, setSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.6);
  const [timer, setTimer] = useState(Math.round(item.duration_seconds / 60));
  const latest = useFinishOnClose(rec, () => listened.current, () => sound.current?.stop(0.5));
  const length = timer * 60;
  const finished = !playing && seconds >= length;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      listened.current += 1;
      setSeconds(listened.current);
      if (listened.current >= length) {
        sound.current?.stop(8); // fade out slowly at the end of the timer
        sound.current = null;
        setPlaying(false);
        latest.current.rec.finish(listened.current, true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [playing, length, latest]);

  function play() {
    if (listened.current >= length) { listened.current = 0; setSeconds(0); }
    rec.start();
    sound.current = startSound(name, volume);
    setPlaying(true);
  }

  function pause() {
    sound.current?.stop();
    sound.current = null;
    setPlaying(false);
  }

  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <div className={`sound-orb ${playing ? "playing" : ""}`} aria-hidden><Moon size={44} /></div>
      <p aria-live="polite" style={{ fontSize: "1.3rem", fontWeight: 700, color: "#111827" }}>
        {playing ? `${clock(length - seconds)} left` : finished ? "Sleep well" : seconds > 0 ? "Paused" : "Ready when you are"}
      </p>
      {playing
        ? <Button variant="secondary" icon={Pause} onClick={pause}>Pause</Button>
        : <Button icon={Play} onClick={play}>{seconds > 0 && !finished ? "Resume" : "Play"}</Button>}
      <div className="row wrap" style={{ justifyContent: "center", gap: 20 }}>
        <label className="row small muted" htmlFor={`volume-${item.content_id}`} style={{ gap: 8 }}>
          <Volume2 size={18} aria-hidden /> Volume
          <input id={`volume-${item.content_id}`} type="range" min={0} max={1} step={0.05} value={volume}
                 onChange={(e) => { const v = Number(e.target.value); setVolume(v); sound.current?.setVolume(v); }} />
        </label>
        <label className="row small muted" htmlFor={`timer-${item.content_id}`} style={{ gap: 8 }}>
          <Clock size={18} aria-hidden /> Stop after
          <select id={`timer-${item.content_id}`} className="input" style={{ width: "auto" }} value={timer}
                  onChange={(e) => setTimer(Number(e.target.value))}>
            {[...new Set([...SLEEP_TIMERS, Math.round(item.duration_seconds / 60)])].sort((a, b) => a - b)
              .map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </div>
      <p className="small muted">The sound fades out gently when the timer ends.</p>
      {rec.log.isSuccess && <Alert kind="success">Session saved.</Alert>}
      {rec.log.isError && <Alert>{messageFor(rec.log.error)}</Alert>}
    </div>
  );
}

type Background = "none" | "rain" | "ocean";

/** A meditation guided by timed steps on screen, read aloud when the browser supports it. */
function GuidedMeditation({ item, steps }: { item: Content; steps: Step[] }) {
  const rec = useSessionRecorder(item);
  const total = item.duration_seconds;
  const elapsedRef = useRef(0);
  const spoken = useRef(-1);
  const backgroundSound = useRef<SoundHandle | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [voice, setVoice] = useState(canSpeak);
  const [background, setBackground] = useState<Background>("none");
  const latest = useFinishOnClose(rec, () => elapsedRef.current, () => { stopSpeaking(); backgroundSound.current?.stop(0.5); });

  const index = steps.reduce((found, s, i) => (s.at <= elapsed ? i : found), 0);
  const done = elapsed >= total;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      elapsedRef.current = Math.min(total, elapsedRef.current + 0.5);
      setElapsed(elapsedRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [running, total]);

  // read each step aloud once, when it is reached
  useEffect(() => {
    if (running && voice && spoken.current !== index) speak(steps[index].text);
    if (running) spoken.current = index;
  }, [running, voice, index, steps]);

  useEffect(() => {
    if (!running || !done) return;
    setRunning(false);
    backgroundSound.current?.stop(6);
    backgroundSound.current = null;
    chime();
    latest.current.rec.finish(total, true);
  }, [running, done, total, latest]);

  function start() {
    audioContext();
    if (elapsedRef.current === 0 || done) {
      elapsedRef.current = 0;
      setElapsed(0);
      spoken.current = -1;
      chime();
      rec.start();
    }
    if (background !== "none") backgroundSound.current = startSound(background, 0.25);
    setRunning(true);
  }

  function pause() {
    setRunning(false);
    stopSpeaking();
    backgroundSound.current?.stop();
    backgroundSound.current = null;
  }

  function stop() {
    pause();
    rec.finish(elapsedRef.current, false);
    elapsedRef.current = 0;
    setElapsed(0);
    spoken.current = -1;
  }

  const started = elapsed > 0 && !done;
  return (
    <div className="stack">
      <div className="meditation-step" aria-live="polite">
        <p className="eyebrow">{done ? "Finished" : started ? `Step ${index + 1} of ${steps.length}` : "Before you start"}</p>
        <p className="meditation-text">
          {done ? "Well done. Take a moment before you get up." : started ? steps[index].text
            : "Find a quiet place. Use headphones if you can, and turn your volume up to hear the guide."}
        </p>
      </div>
      <div className="progress" role="progressbar" aria-label="Meditation progress" aria-valuemin={0} aria-valuemax={total}
           aria-valuenow={Math.round(elapsed)}>
        <span style={{ width: `${(elapsed / total) * 100}%` }} />
      </div>
      <p className="small muted num">{clock(elapsed)} / {clock(total)}</p>
      <div className="row wrap" style={{ gap: 12 }}>
        {running
          ? <Button variant="secondary" icon={Pause} onClick={pause}>Pause</Button>
          : <Button icon={Play} onClick={start}>{started ? "Resume" : done ? "Start again" : "Start"}</Button>}
        {started && <Button variant="secondary" icon={Square} onClick={stop}>Stop</Button>}
      </div>
      <div className="row wrap" style={{ gap: 20 }}>
        {canSpeak && (
          <label className="row small muted" htmlFor={`voice-${item.content_id}`} style={{ gap: 8 }}>
            <Switch id={`voice-${item.content_id}`} label="Read aloud" checked={voice}
                    onChange={(on) => { setVoice(on); if (!on) stopSpeaking(); }} /> Read aloud
          </label>
        )}
        <label className="row small muted" htmlFor={`bg-${item.content_id}`} style={{ gap: 8 }}>
          Background
          <select id={`bg-${item.content_id}`} className="input" style={{ width: "auto" }} value={background}
                  disabled={running} onChange={(e) => setBackground(e.target.value as Background)}>
            <option value="none">None</option>
            <option value="rain">Rain</option>
            <option value="ocean">Ocean waves</option>
          </select>
        </label>
      </div>
      {!canSpeak && <p className="small muted">Your browser can't read the steps aloud, so follow them on screen.</p>}
      {rec.log.isSuccess && <Alert kind="success">Session saved.</Alert>}
      {rec.log.isError && <Alert>{messageFor(rec.log.error)}</Alert>}
    </div>
  );
}

/** A real audio file (a link an admin added). */
function AudioSession({ item }: { item: Content }) {
  const rec = useSessionRecorder(item);
  const listened = useRef(0);
  const last = useRef<number | null>(null);
  const [failed, setFailed] = useState(false);

  // when the player is closed or switched, save what was listened to
  useFinishOnClose(rec, () => listened.current);

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
      <PlayerBody item={item} />
    </Card>
  );
}

function PlayerBody({ item }: { item: Content }) {
  if (item.category === "breathing") return <BreathingGuide item={item} />;
  const builtin = builtinName(item.media_url);
  if (builtin && isSound(builtin)) return <SoundPlayer item={item} name={builtin} />;
  if (builtin && MEDITATIONS[builtin]) return <GuidedMeditation item={item} steps={MEDITATIONS[builtin]} />;
  return <AudioSession item={item} />;
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
