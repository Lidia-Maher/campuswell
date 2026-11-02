import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { Alert, Button, Card, ErrorAlert, Field, Loading, Switch, TextArea } from "../../components/ui";

type Category = Schemas["ContentCreate"]["category"];
const CATEGORY_LABEL: Record<Category, string> = { meditation: "Meditation", breathing: "Breathing", sleep_sounds: "Sleep sounds" };

function AddContent({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>("meditation");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState("5");
  const [mediaUrl, setMediaUrl] = useState("");
  const [pattern, setPattern] = useState({ inhale: "4", hold: "4", exhale: "4" });
  const breathing = category === "breathing";
  const create = useMutation({
    mutationFn: () => unwrap(api.POST("/api/wellness/content", {
      body: {
        category, title: title.trim(), description: description.trim() || null,
        duration_seconds: Math.round(Number(minutes) * 60),
        media_url: breathing ? null : mediaUrl.trim(),
        inhale_seconds: breathing ? Number(pattern.inhale) : null,
        hold_seconds: breathing ? Number(pattern.hold) : null,
        exhale_seconds: breathing ? Number(pattern.exhale) : null,
        is_active: true,
      },
    })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wellness"] }); onDone(); },
  });

  return (
    <Card title="Add wellness content">
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
        <div className="grid grid-half" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="c-category">Category</label>
            <select id="c-category" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Field id="c-title" label="Title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} required />
          <Field id="c-minutes" label="Length (minutes)" type="number" min={1} max={360} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          {breathing ? (
            <div className="row">
              <Field id="c-in" label="In (s)" type="number" min={1} max={60} value={pattern.inhale} onChange={(e) => setPattern({ ...pattern, inhale: e.target.value })} />
              <Field id="c-hold" label="Hold (s)" type="number" min={0} max={60} value={pattern.hold} onChange={(e) => setPattern({ ...pattern, hold: e.target.value })} />
              <Field id="c-out" label="Out (s)" type="number" min={1} max={60} value={pattern.exhale} onChange={(e) => setPattern({ ...pattern, exhale: e.target.value })} />
            </div>
          ) : (
            <Field id="c-media" label="Audio URL" type="url" value={mediaUrl} placeholder="https://…" onChange={(e) => setMediaUrl(e.target.value)}
                   hint="A direct link to an .mp3 file." />
          )}
        </div>
        <TextArea id="c-desc" label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        {create.isError && <Alert>{messageFor(create.error)}</Alert>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
          <Button type="submit" busy={create.isPending} disabled={!title.trim()}>Add</Button>
        </div>
      </form>
    </Card>
  );
}

export function ContentPage() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const content = useQuery({
    queryKey: ["wellness", "content", "all"],
    queryFn: () => unwrap(api.GET("/api/wellness/content", { params: { query: { include_inactive: true } } })),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      unwrap(api.PATCH("/api/wellness/content/{content_id}", { params: { path: { content_id: id } }, body: { is_active: active } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wellness"] }),
  });

  return (
    <div className="stack-lg">
      <div className="row spread">
        <p className="muted">Items students see in the Well-Being library. Hidden items stay in students' history.</p>
        {!adding && <Button icon={Plus} onClick={() => setAdding(true)}>Add content</Button>}
      </div>
      {adding && <AddContent onDone={() => setAdding(false)} />}
      {toggle.isError && <Alert>{messageFor(toggle.error)}</Alert>}
      {content.isPending ? <Loading /> : content.isError ? <ErrorAlert error={content.error} /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Category</th><th className="num">Length</th><th>Audio / pattern</th><th>Visible</th></tr></thead>
            <tbody>
              {content.data.map((c) => (
                <tr key={c.content_id}>
                  <td><strong style={{ color: "#111827" }}>{c.title}</strong></td>
                  <td>{CATEGORY_LABEL[c.category as Category]}</td>
                  <td className="num">{Math.round(c.duration_seconds / 60)} min</td>
                  <td className="small">
                    {c.category === "breathing" ? `${c.inhale_seconds}-${c.hold_seconds ?? 0}-${c.exhale_seconds}` :
                      c.media_url?.includes("campuswell.example") ? <span className="badge badge-warning">Placeholder audio</span> : "Audio linked"}
                  </td>
                  <td>
                    <Switch id={`active-${c.content_id}`} label={`Show ${c.title} to students`} checked={c.is_active}
                            disabled={toggle.isPending} onChange={(on) => toggle.mutate({ id: c.content_id, active: on })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
