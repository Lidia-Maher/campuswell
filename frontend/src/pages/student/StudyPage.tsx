import { Play, Plus, Target, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { messageFor } from "../../api/errors";
import { type Task, useCreateTask, useDeleteTask, useStudyStats, useTasks, useUpdateTask } from "../../api/hooks";
import { BarChart } from "../../components/charts";
import { TaskRow } from "../../components/TaskRow";
import { Alert, Button, Card, ConfirmDialog, Empty, ErrorAlert, Loading, Tabs } from "../../components/ui";
import { minutesLabel, weekday } from "../../lib/format";
import { PomodoroTimer } from "./PomodoroTimer";

const WEEKLY_GOAL_MINUTES = 10 * 60;

function AddTask() {
  const create = useCreateTask();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [due, setDue] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), priority, due_date: due || null }, {
      onSuccess: () => { setTitle(""); setDue(""); setPriority("medium"); },
    });
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 8 }}>
      <div className="row">
        <label htmlFor="new-task" className="sr-only">New task</label>
        <input id="new-task" className="input grow" placeholder="Add a new study goal…" value={title} maxLength={255}
               onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" icon={Plus} busy={create.isPending} disabled={!title.trim()} aria-label="Add task" />
      </div>
      <div className="row wrap small">
        <label htmlFor="new-task-priority" className="muted">Priority</label>
        <select id="new-task-priority" className="input" style={{ width: "auto", padding: "6px 10px" }} value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label htmlFor="new-task-due" className="muted">Due</label>
        <input id="new-task-due" type="date" className="input" style={{ width: "auto", padding: "6px 10px" }} value={due}
               onChange={(e) => setDue(e.target.value)} />
      </div>
      {create.isError && <Alert>{messageFor(create.error)}</Alert>}
    </form>
  );
}

function TaskPanel() {
  const tasks = useTasks();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [confirm, setConfirm] = useState<Task | null>(null);
  const list = (tasks.data ?? []).filter((t) =>
    filter === "all" ? true : filter === "done" ? t.status === "completed" : t.status === "pending" || t.status === "in-progress");

  return (
    <Card title="Focus Tasks" subtitle="What are you working on right now?"
          action={<span className="badge badge-blue">{tasks.data?.length ?? 0} total</span>}>
      <div className="stack">
        <AddTask />
        <Tabs label="Show" value={filter} onChange={setFilter}
              options={[{ value: "open", label: "Open" }, { value: "done", label: "Done" }, { value: "all", label: "All" }]} />
        {tasks.isPending ? <Loading /> : tasks.isError ? <ErrorAlert error={tasks.error} /> :
          list.length === 0 ? <Empty>{filter === "done" ? "No completed tasks yet." : "No tasks here. Add one above."}</Empty> : (
            <ul className="list" style={{ maxHeight: 420, overflowY: "auto" }}>
              {list.map((t) => (
                <TaskRow key={t.task_id} task={t} actions={<>
                  {t.status === "pending" && (
                    <button type="button" className="icon-btn" aria-label={`Start "${t.title}"`} title="Mark as in progress"
                            onClick={() => update.mutate({ id: t.task_id, status: "in-progress" })}>
                      <Play size={16} />
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label={`Delete "${t.title}"`} onClick={() => setConfirm(t)}>
                    <Trash2 size={16} />
                  </button>
                </>} />
              ))}
            </ul>
          )}
      </div>
      <ConfirmDialog open={confirm !== null} title="Delete this task?" confirmLabel="Delete" busy={remove.isPending}
                     onCancel={() => setConfirm(null)}
                     onConfirm={() => confirm && remove.mutate(confirm.task_id, { onSuccess: () => setConfirm(null) })}>
        <p>“{confirm?.title}” will be deleted. Focus sessions linked to it are kept.</p>
      </ConfirmDialog>
    </Card>
  );
}

function History() {
  const stats = useStudyStats(7);
  const s = stats.data;
  const pct = s ? Math.min(100, Math.round((s.focus_minutes / WEEKLY_GOAL_MINUTES) * 100)) : 0;
  return (
    <>
      <section className="card tint-blue row wrap" style={{ gap: 20 }}>
        <Target size={28} color="#2e75b6" aria-hidden />
        <div className="grow">
          <h3>Weekly focus goal</h3>
          <p className="muted small">Reach {WEEKLY_GOAL_MINUTES / 60} hours of focused study in 7 days</p>
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <div className="row spread small"><span>{s ? minutesLabel(s.focus_minutes) : "–"} so far</span><strong>{pct}%</strong></div>
          <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${pct}%`, background: "#2e75b6" }} /></div>
        </div>
      </section>
      <Card title="Study Session History" subtitle="Focused minutes per day, last 7 days"
            footer={s && <span className="muted">{s.sessions_completed} sessions completed · {s.sessions_cancelled} stopped early · {s.tasks_completed} tasks done</span>}>
        {stats.isPending ? <Loading /> : !s ? <ErrorAlert error={stats.error} /> : (
          <BarChart labels={s.daily.map((d) => weekday(d.day))} values={s.daily.map((d) => d.focus_minutes)}
                    label="Focused minutes per day over the last 7 days" unit=" min" />
        )}
      </Card>
    </>
  );
}

export function StudyPage() {
  return (
    <div className="stack-lg">
      <div className="grid grid-half">
        <PomodoroTimer />
        <TaskPanel />
      </div>
      <History />
    </div>
  );
}
