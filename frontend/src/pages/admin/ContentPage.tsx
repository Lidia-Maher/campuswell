import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { ApiError, messageFor } from "../../api/errors";
import { Alert, Button, Card, ConfirmDialog, ErrorAlert, Field, Loading, Switch, TextArea } from "../../components/ui";
import { MEDITATION_NAMES } from "../../lib/meditations";
import { builtinName, builtinUrl, SOUNDS } from "../../lib/soundscapes";

type Content = Schemas["ContentOut"];
type Category = Schemas["ContentCreate"]["category"];
const CATEGORY_LABEL: Record<Category, string> = { meditation: "Meditation", breathing: "Breathing", sleep_sounds: "Sleep sounds" };

// what the app can play without an audio file, per category
const BUILTIN: Record<Category, Record<string, string>> = { meditation: MEDITATION_NAMES, sleep_sounds: SOUNDS, breathing: {} };
const LINK = "link";

function audioLabel(url: string | null | undefined) {
  const name = builtinName(url);
  if (name) return `Built-in: ${MEDITATION_NAMES[name] ?? SOUNDS[name as keyof typeof SOUNDS] ?? name}`;
  return url?.includes("campuswell.example") ? null : "Audio linked";
}

/** Adds new content, or edits `item` when one is given. */
function ContentForm({ item, onDone }: { item?: Content; onDone: () => void }) {
  const qc = useQueryClient();
  const initialCategory = (item?.category as Category | undefined) ?? "meditation";
  const initialBuiltin = builtinName(item?.media_url);
  const [category, setCategory] = useState<Category>(initialCategory);
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [minutes, setMinutes] = useState(String(item ? Math.round(item.duration_seconds / 60) : 5));
  const [mediaUrl, setMediaUrl] = useState(item && !initialBuiltin ? item.media_url ?? "" : "");
  const [source, setSource] = useState(
    item ? initialBuiltin ?? LINK : Object.keys(BUILTIN[initialCategory])[0] ?? LINK,
  );
  const [pattern, setPattern] = useState({
    inhale: String(item?.inhale_seconds ?? 4), hold: String(item?.hold_seconds ?? 4), exhale: String(item?.exhale_seconds ?? 4),
  });
  const breathing = category === "breathing";

  function changeCategory(next: Category) {
    setCategory(next);
    setSource(Object.keys(BUILTIN[next])[0] ?? LINK);
  }

  const body = {
    category, title: title.trim(), description: description.trim() || null,
    duration_seconds: Math.round(Number(minutes) * 60),
    media_url: breathing ? null : source === LINK ? mediaUrl.trim() : builtinUrl(source),
    inhale_seconds: breathing ? Number(pattern.inhale) : null,
    hold_seconds: breathing ? Number(pattern.hold) : null,
    exhale_seconds: breathing ? Number(pattern.exhale) : null,
  };
  const save = useMutation({
    mutationFn: () => item
      ? unwrap(api.PATCH("/api/wellness/content/{content_id}", { params: { path: { content_id: item.content_id } }, body }))
      : unwrap(api.POST("/api/wellness/content", { body: { ...body, is_active: true } })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wellness"] }); onDone(); },
  });

  return (
    <Card title={item ? `Edit "${item.title}"` : "Add wellness content"}>
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-half" style={{ gap: 14 }}>
          <div className="field">
            <label htmlFor="c-category">Category</label>
            <select id="c-category" value={category} onChange={(e) => changeCategory(e.target.value as Category)}>
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
            <div className="field">
              <label htmlFor="c-source">Audio</label>
              <select id="c-source" value={source} onChange={(e) => setSource(e.target.value)}>
                {Object.entries(BUILTIN[category]).map(([v, l]) => <option key={v} value={v}>Built-in: {l}</option>)}
                <option value={LINK}>Link to an audio file…</option>
              </select>
            </div>
          )}
          {!breathing && source === LINK && (
            <Field id="c-media" label="Audio URL" type="url" value={mediaUrl} placeholder="https://…" onChange={(e) => setMediaUrl(e.target.value)}
                   hint="A direct link to an .mp3 file." />
          )}
        </div>
        <TextArea id="c-desc" label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        {save.isError && <Alert>{messageFor(save.error)}</Alert>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onDone}>Cancel</Button>
          <Button type="submit" busy={save.isPending} disabled={!title.trim()}>{item ? "Save changes" : "Add"}</Button>
        </div>
      </form>
    </Card>
  );
}

export function ContentPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Content | "new" | null>(null);
  const [deleting, setDeleting] = useState<Content | null>(null);
  const content = useQuery({
    queryKey: ["wellness", "content", "all"],
    queryFn: () => unwrap(api.GET("/api/wellness/content", { params: { query: { include_inactive: true } } })),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      unwrap(api.PATCH("/api/wellness/content/{content_id}", { params: { path: { content_id: id } }, body: { is_active: active } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wellness"] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE("/api/wellness/content/{content_id}", { params: { path: { content_id: id } } })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["wellness"] }); setDeleting(null); },
  });
  const inUse = remove.error instanceof ApiError && remove.error.code === "content_in_use";

  function openEditor(target: Content | "new") {
    setEditing(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeDelete() {
    setDeleting(null);
    remove.reset();
  }

  return (
    <div className="stack-lg">
      <div className="row spread">
        <p className="muted">Items students see in the Well-Being library. Hidden items stay in students' history.</p>
        {!editing && <Button icon={Plus} onClick={() => openEditor("new")}>Add content</Button>}
      </div>
      {editing && (
        <ContentForm key={editing === "new" ? "new" : editing.content_id}
                     item={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
      )}
      {toggle.isError && <Alert>{messageFor(toggle.error)}</Alert>}
      {content.isPending ? <Loading /> : content.isError ? <ErrorAlert error={content.error} /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Title</th><th>Category</th><th className="num">Length</th><th>Audio / pattern</th><th>Visible</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {content.data.map((c) => (
                <tr key={c.content_id}>
                  <td><strong style={{ color: "#111827" }}>{c.title}</strong></td>
                  <td>{CATEGORY_LABEL[c.category as Category]}</td>
                  <td className="num">{Math.round(c.duration_seconds / 60)} min</td>
                  <td className="small">
                    {c.category === "breathing" ? `${c.inhale_seconds}-${c.hold_seconds ?? 0}-${c.exhale_seconds}` :
                      audioLabel(c.media_url) ?? <span className="badge badge-warning">Placeholder audio</span>}
                  </td>
                  <td>
                    <Switch id={`active-${c.content_id}`} label={`Show ${c.title} to students`} checked={c.is_active}
                            disabled={toggle.isPending} onChange={(on) => toggle.mutate({ id: c.content_id, active: on })} />
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <button type="button" className="icon-btn" onClick={() => openEditor(c)} aria-label={`Edit ${c.title}`} title="Edit">
                        <Pencil size={17} />
                      </button>
                      <button type="button" className="icon-btn" onClick={() => setDeleting(c)} aria-label={`Delete ${c.title}`} title="Delete"
                              style={{ color: "var(--danger)" }}>
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog open={deleting !== null} title={`Delete "${deleting?.title ?? ""}"?`}
                     confirmLabel={inUse ? "Hide it instead" : "Delete"} danger={!inUse} busy={remove.isPending || toggle.isPending}
                     onCancel={closeDelete}
                     onConfirm={() => {
                       if (!deleting) return;
                       if (inUse) toggle.mutate({ id: deleting.content_id, active: false }, { onSuccess: closeDelete });
                       else remove.mutate(deleting.content_id);
                     }}>
        {inUse ? (
          <Alert kind="warning">
            Students have already used this item, so deleting it would erase their history. Hide it instead: students
            won't see it in the library, but their past sessions stay.
          </Alert>
        ) : (
          <>
            <p>This removes it from the library for good. To take it away only for now, switch off Visible instead.</p>
            {remove.isError && <Alert>{messageFor(remove.error)}</Alert>}
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
