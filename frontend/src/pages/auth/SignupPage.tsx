import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { firebaseAuth, firebaseEnabled } from "../../auth/firebase";
import { firebaseMessage } from "../../auth/firebaseErrors";
import { isAllowedEmail, STUDENT_DOMAIN } from "../../auth/session";
import { Alert, AuthCard, Button, Field } from "../../components/ui";

export function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!isAllowedEmail(email)) found.email = `Use your university email, ending in @${STUDENT_DOMAIN}.`;
    if (password.length < 8) found.password = "Use at least 8 characters.";
    if (confirm !== password) found.confirm = "The passwords don't match.";
    setErrors(found);
    setFormError("");
    if (Object.keys(found).length || !firebaseAuth) return;

    setBusy(true);
    try {
      const { user } = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      await sendEmailVerification(user);
      // AuthProvider sees an unverified user and opens the "check your inbox" page
    } catch (e) {
      setFormError(firebaseMessage(e));
      setBusy(false);
    }
  }

  if (!firebaseEnabled) {
    return (
      <AuthCard title="Create an account">
        <Alert kind="info">Sign-up needs the Firebase web config in <code>.env.local</code>.</Alert>
        <Link to="/login">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create an account" intro="CampusWell is for PSUT students and staff.">
      <form className="stack" onSubmit={submit} noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Field id="signup-email" label="University email" type="email" autoComplete="email"
               hint={`Students: name@${STUDENT_DOMAIN}`} error={errors.email}
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="signup-password" label="Password" type="password" autoComplete="new-password"
               hint="At least 8 characters" error={errors.password}
               value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field id="signup-confirm" label="Repeat password" type="password" autoComplete="new-password"
               error={errors.confirm} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" busy={busy}>Create account</Button>
        <p className="muted">Already have an account? <Link to="/login">Sign in</Link></p>
      </form>
    </AuthCard>
  );
}
