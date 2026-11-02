import { type FormEvent, useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { ApiError, messageFor } from "../../api/errors";
import { useAuth } from "../../auth/AuthProvider";
import { Alert, AuthCard, Button, Field } from "../../components/ui";

type Department = Schemas["UserRegister"]["department"];

const SCHOOLS: { value: Department; label: string }[] = [
  { value: "computing", label: "King Hussein School of Computing Sciences" },
  { value: "engineering", label: "King Abdullah II School of Engineering" },
  { value: "business", label: "King Talal School of Business Technology" },
];

export function RegisterPage() {
  const { session, refresh, signOut } = useAuth();
  const email = session.status === "needsRegistration" ? session.email : "";
  const [name, setName] = useState("");
  const [department, setDepartment] = useState<Department | "">("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Enter your name.";
    if (!department) found.department = "Choose your school.";
    if (!consent) found.consent = "You need to agree before using CampusWell.";
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length || !department) return;

    setBusy(true);
    try {
      await unwrap(api.POST("/api/me", { body: { name: name.trim(), department, consent: true } }));
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === "already_registered") return void refresh();
      setFormError(messageFor(e));
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Set up your profile" intro={<p>Signed in as <strong>{email}</strong>.</p>}>
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Field id="reg-name" label="Your name" autoComplete="name" maxLength={100} error={errors.name}
               value={name} onChange={(e) => setName(e.target.value)} />

        <div className="field">
          <label htmlFor="reg-school">School</label>
          <select id="reg-school" value={department} aria-invalid={errors.department ? true : undefined}
                  onChange={(e) => setDepartment(e.target.value as Department)}>
            <option value="" disabled>Choose your school</option>
            {SCHOOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {errors.department && <p className="field-error">{errors.department}</p>}
        </div>

        {/* TODO: replace with the exact consent wording from the GP1 report (Table 3.16) */}
        <div className="consent">
          <p><strong>How CampusWell uses your data</strong></p>
          <ul>
            <li>Your moods, tasks, questionnaire answers and notes are visible only to you.</li>
            <li>Counsellors see anonymous averages for groups of at least 5 students, never your name or notes.</li>
            <li>CampusWell supports your well-being; it does not diagnose or replace professional care.</li>
            <li>You can delete your account and all your data at any time from Settings.</li>
          </ul>
          <label className="check">
            <input type="checkbox" id="reg-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                   aria-invalid={errors.consent ? true : undefined} />
            <span>I have read this and agree.</span>
          </label>
          {errors.consent && <p className="field-error">{errors.consent}</p>}
        </div>

        <Button type="submit" busy={busy}>Continue</Button>
        <button type="button" className="linklike" onClick={() => void signOut()}>Sign out</button>
      </form>
    </AuthCard>
  );
}
