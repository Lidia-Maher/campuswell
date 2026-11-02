import { Coffee, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { messageFor } from "../../api/errors";
import { useLogPomodoro, useTasks } from "../../api/hooks";
import { Alert, Button, Card, Tabs } from "../../components/ui";

type Mode = "focus" | "break";
const LENGTHS: Record<Mode, number> = { focus: 25, break: 5 }; // minutes

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.4);
    });
  } catch {
    // no audio available: the on-screen message is enough
  }
}

function notify(text: string) {
  if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
    new Notification("CampusWell", { body: text, icon: "/favicon.svg" });
  }
}

/**
 * FR-04. Time is measured from the clock (Date.now), not by counting ticks, so the timer
 * stays correct when the browser slows down a background tab.
 */
export function PomodoroTimer() {
  const tasks = useTasks();
  const log = useLogPomodoro();
  const [mode, setMode] = useState<Mode>("focus");
  const [endsAt, setEndsAt] = useState<number | null>(null); // set while running
  const [remainingMs, setRemainingMs] = useState(LENGTHS.focus * 60_000);
  const [taskId, setTaskId] = useState<string>("");
  const [message, setMessage] = useState<{ kind: "success" | "info"; text: string } | null>(null);
  const startedAt = useRef<Date | null>(null); // when this focus session first started
  const runMs = useRef(0); // time actually spent running (pauses excluded)
  const lastTick = useRef<number | null>(null);

  const totalMs = LENGTHS[mode] * 60_000;
  const running = endsAt !== null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (lastTick.current) runMs.current += now - lastTick.current;
      lastTick.current = now;
      const left = Math.max(0, endsAt - now);
      setRemainingMs(left);
      if (left === 0) finish();
    }, 250);
    return () => clearInterval(id);
  }); // re-subscribes each render so finish() sees fresh state

  function save(status: "completed" | "cancelled") {
    if (!startedAt.current) return;
    const minutes = status === "completed" ? LENGTHS.focus : Math.floor(runMs.current / 60_000);
    if (status === "cancelled" && minutes < 1) return; // under a minute: not worth recording
    log.mutate({
      planned_minutes: LENGTHS.focus,
      duration_minutes: minutes,
      status,
      started_at: startedAt.current.toISOString(),
      completed_at: new Date().toISOString(),
      task_id: taskId ? Number(taskId) : null,
    });
  }

  function reset(next: Mode = mode) {
    setEndsAt(null);
    lastTick.current = null;
    runMs.current = 0;
    startedAt.current = null;
    setMode(next);
    setRemainingMs(LENGTHS[next] * 60_000);
  }

  function finish() {
    chime();
    if (mode === "focus") {
      save("completed");
      setMessage({ kind: "success", text: "Focus session complete and saved. Take a 5-minute break." });
      notify("Focus session complete. Time for a short break.");
      reset("break");
    } else {
      setMessage({ kind: "info", text: "Break over. Ready for the next focus session?" });
      notify("Break over. Ready to focus?");
      reset("focus");
    }
  }

  function start() {
    setMessage(null);
    if (mode === "focus" && !startedAt.current) startedAt.current = new Date();
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    lastTick.current = Date.now();
    setEndsAt(Date.now() + remainingMs);
  }

  function pause() {
    if (lastTick.current) runMs.current += Date.now() - lastTick.current;
    lastTick.current = null;
    setEndsAt(null);
  }

  function stopAndReset() {
    if (mode === "focus" && startedAt.current) {
      if (running && lastTick.current) runMs.current += Date.now() - lastTick.current;
      save("cancelled");
      if (runMs.current >= 60_000) setMessage({ kind: "info", text: "Stopped early. The minutes you focused were saved." });
    }
    reset();
  }

  const mm = String(Math.floor(remainingMs / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, "0");
  const progress = 1 - remainingMs / totalMs;
  const R = 108;
  const circumference = 2 * Math.PI * R;
  const openTasks = (tasks.data ?? []).filter((t) => t.status === "pending" || t.status === "in-progress");

  return (
    <Card>
      <div className="stack" style={{ alignItems: "center", gap: 20 }}>
        <Tabs label="Timer mode" value={mode} onChange={(m) => { if (!running) reset(m); }}
              options={[{ value: "focus", label: "Focus", icon: Timer }, { value: "break", label: "Short Break", icon: Coffee }]} />
        <div style={{ position: "relative", width: 240, height: 240 }}>
          <svg width="240" height="240" viewBox="0 0 240 240" aria-hidden>
            <circle cx="120" cy="120" r={R} fill="none" stroke="#eef1f5" strokeWidth="10" />
            <circle cx="120" cy="120" r={R} fill="none" stroke={mode === "focus" ? "#2e75b6" : "#52b788"} strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
                    transform="rotate(-90 120 120)" />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", textAlign: "center" }}>
            <span className="num" style={{ fontSize: "3.4rem", fontWeight: 700, color: "#111827", lineHeight: 1 }}
                  role="timer" aria-live="off">{mm}:{ss}</span>
            <span className="eyebrow" style={{ marginTop: 6 }}>{running ? (mode === "focus" ? "Focusing" : "On a break") : "Ready?"}</span>
          </div>
        </div>
        {mode === "focus" && (
          <div className="field" style={{ width: "100%", maxWidth: 320 }}>
            <label htmlFor="pomodoro-task">Working on</label>
            <select id="pomodoro-task" value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={startedAt.current !== null}>
              <option value="">No specific task</option>
              {openTasks.map((t) => <option key={t.task_id} value={t.task_id}>{t.title}</option>)}
            </select>
          </div>
        )}
        <div className="row">
          {running
            ? <Button size="lg" icon={Pause} onClick={pause} style={{ minWidth: 200 }}>Pause</Button>
            : <Button size="lg" icon={Play} onClick={start} style={{ minWidth: 200 }}>
                {remainingMs < totalMs ? "Resume" : "Start"}
              </Button>}
          <Button variant="secondary" size="lg" icon={RotateCcw} onClick={stopAndReset} aria-label="Stop and reset" />
        </div>
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        {log.isError && <Alert>{messageFor(log.error)}</Alert>}
      </div>
    </Card>
  );
}
