import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteUser, sendPasswordResetEmail } from "firebase/auth";
import { Bell, Download, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { api, type Role, type Schemas, unwrap } from "../api/client";
import { messageFor } from "../api/errors";
import { REMINDER_TEXT, type ReminderType, useReminders, useSetReminder } from "../api/reminders";
import { useAuth, useCurrentUser } from "../auth/AuthProvider";
import { firebaseAuth } from "../auth/firebase";
import { Alert, Button, Card, ConfirmDialog, ErrorAlert, Field, Loading, Switch } from "../components/ui";
import { downloadFile } from "../lib/download";
import { todayLocal } from "../lib/format";

type Department = NonNullable<Schemas["UserUpdate"]["department"]>;
const SCHOOLS: { value: Department; label: string }[] = [
  { value: "computing", label: "King Hussein School of Computing Sciences" },
  { value: "engineering", label: "King Abdullah II School of Engineering" },
  { value: "business", label: "King Talal School of Business Technology" },
];
const ROLE_LABEL: Record<Role, string> = { student: "Student", admin: "Administrator", counsellor: "Counsellor" };

function Profile() {
  const user = useCurrentUser();
  const { refresh } = useAuth();
  const [name, setName] = useState(user.name);
  const [department, setDepartment] = useState<Department | "">((user.department as Department | null) ?? "");
  const save = useMutation({
    mutationFn: () => unwrap(api.PATCH("/api/me", { body: { name: name.trim(), ...(department ? { department } : {}) } })),
    onSuccess: () => void refresh(),
  });
  const changed = name.trim() !== user.name || (department || null) !== user.department;

  return (
    <Card title="Account Information" subtitle="Your name and school, as shown in CampusWell.">
      <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-half" style={{ gap: 16 }}>
          <Field id="settings-name" label="Display name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          <Field id="settings-email" label="University email" value={user.email} disabled
                 hint="Your sign-in email can't be changed here." />
          <div className="field">
            <label htmlFor="settings-school">School</label>
            <select id="settings-school" value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
              {user.role !== "student" && <option value="">None</option>}
              {SCHOOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <Field id="settings-role" label="Role" value={ROLE_LABEL[user.role as Role]} disabled />
        </div>
        {save.isError && <Alert>{messageFor(save.error)}</Alert>}
        {save.isSuccess && !changed && <Alert kind="success">Saved.</Alert>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="secondary" busy={save.isPending} disabled={!changed || !name.trim()}>Save Changes</Button>
        </div>
      </form>
    </Card>
  );
}

function Notifications() {
  const reminders = useReminders();
  const set = useSetReminder();
  const [permission, setPermission] = useState(() => ("Notification" in window ? Notification.permission : "unsupported"));

  return (
    <Card title="Notifications & Reminders" subtitle="Choose when CampusWell reminds you. Times are Jordan time.">
      <div className="stack">
        {permission !== "granted" && (
          <Alert kind="info">
            {permission === "denied"
              ? "Notifications are blocked for this site. Allow them in your browser's site settings to get reminders."
              : permission === "unsupported" ? "This browser can't show notifications."
              : <span className="row wrap">Reminders appear as browser notifications.
                  <Button variant="secondary" icon={Bell}
                          onClick={() => void Notification.requestPermission().then(setPermission)}>Allow notifications</Button></span>}
          </Alert>
        )}
        {reminders.isPending ? <Loading /> : reminders.isError ? <ErrorAlert error={reminders.error} /> : (
          <ul className="list">
            {reminders.data.map((r) => {
              const text = REMINDER_TEXT[r.reminder_type as ReminderType];
              const update = (patch: { remind_at?: string; is_enabled?: boolean }) =>
                set.mutate({ type: r.reminder_type, remind_at: patch.remind_at ?? r.remind_at, is_enabled: patch.is_enabled ?? r.is_enabled });
              return (
                <li key={r.reminder_type} className="list-item wrap" style={{ flexWrap: "wrap" }}>
                  <Bell size={18} color="#2e75b6" aria-hidden />
                  <div className="grow">
                    <strong>{text.title}</strong>
                    <div className="small muted">{text.description}</div>
                  </div>
                  <label htmlFor={`time-${r.reminder_type}`} className="sr-only">{text.title} time</label>
                  <input id={`time-${r.reminder_type}`} type="time" className="input" style={{ width: "auto" }}
                         value={r.remind_at.slice(0, 5)} onChange={(e) => e.target.value && update({ remind_at: e.target.value })} />
                  <Switch id={`on-${r.reminder_type}`} label={`${text.title} on or off`} checked={r.is_enabled}
                          onChange={(on) => update({ is_enabled: on })} />
                </li>
              );
            })}
          </ul>
        )}
        {set.isError && <Alert>{messageFor(set.error)}</Alert>}
        <p className="small muted">Reminders show while CampusWell is open in a browser tab.</p>
      </div>
    </Card>
  );
}

function PrivacyAndData() {
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function exportData() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await unwrap(api.GET("/api/me/export"));
      downloadFile(`campuswell-my-data-${todayLocal()}.json`, JSON.stringify(data, null, 2), "application/json");
    } catch (e) {
      setMessage({ kind: "error", text: messageFor(e) });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!firebaseAuth) return setMessage({ kind: "error", text: "Password reset needs Firebase sign-in." });
    try {
      await sendPasswordResetEmail(firebaseAuth, user.email);
      setMessage({ kind: "success", text: `A password reset link was sent to ${user.email}.` });
    } catch {
      setMessage({ kind: "error", text: "Couldn't send the reset email. Try again later." });
    }
  }

  return (
    <Card title="Privacy & Data Control" subtitle="Your data belongs to you.">
      <ul className="list">
        <li className="list-item" style={{ flexWrap: "wrap" }}>
          <Download size={18} color="#2e75b6" aria-hidden />
          <div className="grow"><strong>Export your data</strong><div className="small muted">Download everything CampusWell stores about you, as a JSON file.</div></div>
          <Button variant="secondary" busy={busy} onClick={() => void exportData()}>Download</Button>
        </li>
        <li className="list-item" style={{ flexWrap: "wrap" }}>
          <KeyRound size={18} color="#2e75b6" aria-hidden />
          <div className="grow"><strong>Change password</strong><div className="small muted">We'll email you a secure link to set a new password.</div></div>
          <Button variant="secondary" onClick={() => void resetPassword()}>Send link</Button>
        </li>
      </ul>
      {message && <div style={{ marginTop: 12 }}><Alert kind={message.kind}>{message.text}</Alert></div>}
    </Card>
  );
}

function DangerZone() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"erase" | "delete" | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const erase = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/me/data")),
    onSuccess: () => {
      void qc.invalidateQueries();
      setConfirm(null);
      setMessage({ kind: "success", text: "Your history was erased." });
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      await unwrap(api.DELETE("/api/me"));
      const fbUser = firebaseAuth?.currentUser;
      if (fbUser) {
        try {
          await deleteUser(fbUser);
        } catch {
          // Firebase may ask for a recent sign-in; the CampusWell data is already gone either way
        }
      }
    },
    onSuccess: () => void signOut(),
  });

  return (
    <section className="card" style={{ background: "#fdf5f5", borderColor: "#f3c9c9" }} aria-labelledby="danger-title">
      <h2 id="danger-title" className="row" style={{ color: "#dc2626" }}><ShieldAlert size={20} aria-hidden /> Danger Zone</h2>
      <p className="small" style={{ color: "#b42318", margin: "4px 0 16px" }}>These actions are permanent and can't be undone.</p>
      <div className="stack">
        {user.role === "student" && (
          <div className="row spread" style={{ borderTop: "1px solid #f3c9c9", paddingTop: 14 }}>
            <div className="grow">
              <strong style={{ color: "#111827" }}>Erase my history</strong>
              <p className="small muted">Deletes your moods, tasks, focus and wellness sessions, and questionnaires. Your account, posts and reminders stay.</p>
            </div>
            <Button variant="danger-outline" onClick={() => setConfirm("erase")}>Erase History</Button>
          </div>
        )}
        <div className="row spread" style={{ borderTop: "1px solid #f3c9c9", paddingTop: 14 }}>
          <div className="grow">
            <strong style={{ color: "#111827" }}>Delete account</strong>
            <p className="small muted">Deletes your account and everything associated with it.</p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirm("delete")}>Delete Account</Button>
        </div>
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        {(erase.isError || remove.isError) && <Alert>{messageFor(erase.error ?? remove.error)}</Alert>}
      </div>
      <ConfirmDialog open={confirm === "erase"} title="Erase your history?" confirmLabel="Erase everything"
                     busy={erase.isPending} onCancel={() => setConfirm(null)} onConfirm={() => erase.mutate()}>
        <p>All your mood check-ins, tasks, focus and wellness sessions and questionnaire results will be permanently deleted.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === "delete"} title="Delete your account?" confirmLabel="Delete my account"
                     busy={remove.isPending} onCancel={() => setConfirm(null)} onConfirm={() => remove.mutate()}>
        <p>Your account and <strong>all</strong> your data will be permanently deleted. You'll be signed out.</p>
      </ConfirmDialog>
    </section>
  );
}

export function SettingsPage() {
  const user = useCurrentUser();
  return (
    <div className="stack-lg" style={{ maxWidth: 860, margin: "0 auto", width: "100%" }}>
      <Profile />
      {user.role === "student" && <Notifications />}
      <PrivacyAndData />
      <DangerZone />
    </div>
  );
}
