import { CheckCircle2, Circle } from "lucide-react";
import type { ReactNode } from "react";

import { type Task, useUpdateTask } from "../api/hooks";
import { shortDate } from "../lib/format";

const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

/** One task with a tick box. Used on the dashboard and in Study Tools. */
export function TaskRow({ task, actions }: { task: Task; actions?: ReactNode }) {
  const update = useUpdateTask();
  const done = task.status === "completed";
  const toggle = () => update.mutate({ id: task.task_id, status: done ? "pending" : "completed" });

  return (
    <li className="list-item">
      <button type="button" className="icon-btn" onClick={toggle} disabled={update.isPending}
              aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
              style={{ color: done ? "#52b788" : undefined }}>
        {done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      <div className="grow">
        <strong className={done ? "done-text" : ""}>{task.title}</strong>
        <div className="small muted">
          {task.status === "in-progress" ? "In progress" : done ? "Completed" : task.status === "cancelled" ? "Cancelled" : "Pending"}
          {task.due_date && ` · due ${shortDate(task.due_date)}`}
          {task.is_overdue && <span style={{ color: "#dc2626" }}> · overdue</span>}
        </div>
      </div>
      <span className={`badge badge-${task.priority}`}>{PRIORITY_LABEL[task.priority as keyof typeof PRIORITY_LABEL]}</span>
      {actions}
    </li>
  );
}
