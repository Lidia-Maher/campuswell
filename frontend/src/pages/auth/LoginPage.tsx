import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { useAuth } from "../../auth/AuthProvider";
import { devLoginEnabled, firebaseAuth, firebaseEnabled } from "../../auth/firebase";
import { firebaseMessage } from "../../auth/firebaseErrors";
import { Alert, AuthCard, Button, Field } from "../../components/ui";

const DEMO_USERS = [
  { name: "sara", label: "Sara · student" },
  { name: "noor", label: "Noor · student (support flag)" },
  { name: "admin", label: "Admin" },
  { name: "counsellor", label: "Counsellor" },
];

export function LoginPage() {
  const { devSignIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [devName, setDevName] = useState("");

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!firebaseAuth) return;
    setError("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      // AuthProvider notices the sign-in and moves on to the right page
    } catch (e) {
      setError(firebaseMessage(e));
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!firebaseAuth) return;
    setError("");
    if (!email.trim()) return setError("Type your email above first, then choose \"Forgot password\".");
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
    } catch (e) {
      setError(firebaseMessage(e));
    }
  }

  return (
    <AuthCard title="Welcome back" intro="Sign in to access your dashboard and wellness tools.">
      {firebaseEnabled ? (
        <form className="stack" onSubmit={signIn} noValidate>
          {error && <Alert>{error}</Alert>}
          {notice && <Alert kind="info">{notice}</Alert>}
          <Field id="login-email" label="University email" type="email" autoComplete="email"
                 value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field id="login-password" label="Password" type="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" busy={busy}>Sign in</Button>
          <div className="row spread">
            <button type="button" className="linklike" onClick={() => void resetPassword()}>Forgot password</button>
            <Link to="/signup">Create an account</Link>
          </div>
        </form>
      ) : (
        <Alert kind="info">
          Firebase sign-in is not configured yet. Add the Firebase web config to <code>.env.local</code> (see{" "}
          <code>.env.example</code>).
        </Alert>
      )}

      {devLoginEnabled && (
        <form
          className="stack devbox"
          onSubmit={(e) => {
            e.preventDefault();
            if (devName.trim()) void devSignIn(devName);
          }}
        >
          <p className="eyebrow">Dev login · local backend only</p>
          <div className="row wrap">
            {DEMO_USERS.map((u) => (
              <Button key={u.name} type="button" variant="secondary" onClick={() => void devSignIn(u.name)}>
                {u.label}
              </Button>
            ))}
          </div>
          <div className="row">
            <Field id="dev-name" label="Or any name" value={devName} onChange={(e) => setDevName(e.target.value)}
                   placeholder="omar" />
            <Button type="submit" variant="secondary">Go</Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}
